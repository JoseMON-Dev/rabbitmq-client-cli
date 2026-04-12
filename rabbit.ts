/**
 * Deno RabbitMQ TUI - Producer/Consumer Load Tool
 * * Versión actualizada para compatibilidad con Deno moderno (v1.40+)
 * * Dependencies:
 * - Cliffy (UI: Tables, Colors, Keypress, Prompt)
 * - Deno AMQP (RabbitMQ protocol)
 */

import { Table } from "https://deno.land/x/cliffy@v1.0.0-rc.4/table/mod.ts";
import { colors } from "https://deno.land/x/cliffy@v1.0.0-rc.4/ansi/colors.ts";
import { keypress } from "https://deno.land/x/cliffy@v1.0.0-rc.4/keypress/mod.ts";
import { Input, Number as NumberPrompt } from "https://deno.land/x/cliffy@v1.0.0-rc.4/prompt/mod.ts";
import { connect } from "https://deno.land/x/amqp@v0.23.1/mod.ts";

// Configuración inicial
let config = {
  url: "amqp://admin:admin@localhost:5672",
  queue: "deno_load_test_queue",
  burstSize: 50
};

// Estado de la aplicación
let mode: "PRODUCER" | "CONSUMER" = "CONSUMER";
let logs: string[] = ["Presione 'P' para Productor, 'C' para Consumidor, 'Q' para Salir"];
let stats = { sent: 0, received: 0 };
let connection: any;
let channel: any;
let isRunning = true;
let isPrompting = false; // Bloquea el renderizado mientras se pide un input
let consumerTag: string | null = null; // Guarda el tag del consumidor activo

/**
 * Fase de configuración inicial
 */
async function setupConfig() {
  console.log(colors.bold.magenta("=== Configuración de RabbitMQ ==="));

  try {
    const url = await Input.prompt({
      message: "URL de RabbitMQ:",
      default: config.url,
    });

    const queue = await Input.prompt({
      message: "Nombre de la cola:",
      default: config.queue,
    });

    const burstResponse = await NumberPrompt.prompt({
      message: "Tamaño de ráfaga predeterminado:",
      default: config.burstSize,
      min: 1,
      max: 1000
    });

    config = { url, queue, burstSize: burstResponse };
  } catch (_e) {
    console.log(colors.red("\nConfiguración cancelada."));
    Deno.exit(0);
  }
}

/**
 * Inicializa la conexión
 */
async function initRabbit() {
  try {
    connection = await connect(config.url);
    channel = await connection.openChannel();

    // Se añade durable: true para coincidir con colas persistentes existentes
    // y evitar el error 406 PRECONDITION_FAILED
    await channel.declareQueue({
      queue: config.queue,
      durable: true
    });

    addLog(colors.green(`Conectado a ${config.url}`));
  } catch (err) {
    console.error(colors.red(`\n❌ Error crítico de conexión: ${err.message}`));
    if (err.message.includes("PRECONDITION_FAILED")) {
      console.log(colors.yellow("Sugerencia: La cola ya existe con parámetros distintos (ej. durable/autoDelete)."));
    }
    Deno.exit(1);
  }
}

function addLog(msg: string) {
  logs.push(`[${new Date().toLocaleTimeString()}] ${msg}`);
  if (logs.length > 10) logs.shift();
}

/**
 * Renderiza la interfaz TUI
 */
function render() {
  if (!isRunning || isPrompting) return;

  console.clear();
  console.log(colors.bold.bgMagenta.white("  DENO RABBITMQ LOAD TOOL  "));
  console.log("");

  new Table()
    .header([colors.cyan("Conexión"), colors.cyan("Modo"), colors.cyan("Enviados"), colors.cyan("Recibidos")])
    .body([
      [
        connection ? colors.green("ACTIVA") : colors.red("OFFLINE"),
        colors.yellow(mode),
        colors.magenta(stats.sent.toString()),
        colors.blue(stats.received.toString())
      ]
    ])
    .border(true)
    .render();

  console.log(`${colors.gray("Cola:")} ${colors.white(config.queue)} ${colors.dim("(Durable: true)")}`);
  
  // Indicador visual de si está escuchando o no
  if (consumerTag) {
    console.log(colors.bgGreen.black(" 🎧 ESCUCHANDO MENSAJES "));
  } else {
    console.log(colors.bgRed.white(" 🔇 RECEPCIÓN PAUSADA "));
  }

  console.log(colors.bold("\nLogs de Actividad:"));
  logs.forEach(l => console.log(l));

  console.log("\n" + colors.black.bgWhite(" CONTROLES "));
  const controls = [
    ["[P/C]", "Cambiar Modo"],
    ["[S]", "Msg Aleatorio (1)"],
    ["[B]", `Ráfaga Aleatoria (${config.burstSize})`],
    ["[L]", "Cargar JSON String"],
    ["[R]", "Reset Stats"],
    ["[Q]", "Salir"]
  ];

  new Table()
    .body(controls)
    .padding(2)
    .render();
}

/**
 * Lógica para enviar mensajes (Aleatorios o JSON)
 */
async function sendMessages(payload?: string, count: number = 1) {
  if (!channel) return;

  const tasks = [];
  for (let i = 0; i < count; i++) {
    const finalMsg = payload || JSON.stringify({
      id: stats.sent + i + 1,
      timestamp: Date.now(),
      data: Math.random().toString(36).substring(7),
      type: "random_burst"
    });

    tasks.push(
      channel.publish(
        { routingKey: config.queue },
        { contentType: "application/json" },
        new TextEncoder().encode(finalMsg)
      )
    );
  }

  await Promise.all(tasks);
  stats.sent += count;

  if (count > 1) {
    addLog(colors.brightMagenta(`🚀 Ráfaga enviada: ${count} mensajes`));
  } else {
    addLog(colors.magenta(`📤 Enviado: ${payload ? "JSON personalizado" : "Msg Aleatorio"}`));
  }
}

/**
 * Lógica para capturar un JSON del usuario
 */
async function promptJsonLoad() {
  isPrompting = true;
  console.log("\n" + colors.bgBlue.white(" MODO CARGA JSON "));
  try {
    const jsonStr = await Input.prompt({
      message: "Pega el JSON string a enviar:",
    });

    // Validar si es JSON
    JSON.parse(jsonStr);
    await sendMessages(jsonStr, 1);
  } catch (err) {
    addLog(colors.red(`❌ Error JSON: ${err.message}`));
  } finally {
    isPrompting = false;
    render();
  }
}

/**
 * Iniciar el Consumidor
 */
async function startConsuming() {
  if (!channel || consumerTag) return; // Evitar múltiples suscripciones simultáneas
  
  try {
    const response = await channel.consume(
      { queue: config.queue },
      async (args: any, _props: any, data: Uint8Array) => {
        const message = new TextDecoder().decode(data);
        stats.received++;

        try {
          // Intentar parsear para mostrar algo bonito si es JSON
          const parsed = JSON.parse(message);
          addLog(colors.blue(`📥 Recibido JSON (ID: ${parsed.id || '?'})`));
        } catch {
          addLog(colors.blue(`📥 Recibido: ${message.substring(0, 15)}...`));
        }

        await channel.ack({ deliveryTag: args.deliveryTag });
        render();
      }
    );
    
    // Guardamos el tag para poder cancelarlo después
    consumerTag = response.consumerTag;
    addLog(colors.green("▶️ Consumidor activado"));
  } catch (error) {
    addLog(colors.red(`❌ Error al iniciar consumidor: ${error.message}`));
  }
}

/**
 * Detener el Consumidor
 */
async function stopConsuming() {
  if (!channel || !consumerTag) return;
  
  try {
    await channel.cancel({ consumerTag });
    consumerTag = null;
    addLog(colors.yellow("⏸️ Consumidor desconectado"));
  } catch (error) {
    addLog(colors.red(`❌ Error al detener consumidor: ${error.message}`));
  }
}

/**
 * Main
 */
async function main() {
  await setupConfig();
  await initRabbit();
  
  // Inicia escuchando por defecto porque el modo inicial es CONSUMER
  if (mode === "CONSUMER") {
    await startConsuming();
  }

  // Input listener
  (async () => {
    try {
      for await (const event of keypress()) {
        if (isPrompting) continue;

        if (event.key === "q" || (event.ctrlKey && event.key === "c")) {
          isRunning = false;
          break;
        }

        switch (event.key) {
          case "p":
            if (mode !== "PRODUCER") {
              mode = "PRODUCER";
              await stopConsuming(); // Dejamos de escuchar
            }
            break;
          case "c":
            if (mode !== "CONSUMER") {
              mode = "CONSUMER";
              await startConsuming(); // Volvemos a escuchar
            }
            break;
          case "s":
            if (mode === "PRODUCER") await sendMessages(undefined, 1);
            else addLog(colors.yellow("⚠️ Cambia a modo Productor primero"));
            break;
          case "b":
            if (mode === "PRODUCER") await sendMessages(undefined, config.burstSize);
            else addLog(colors.yellow("⚠️ Cambia a modo Productor primero"));
            break;
          case "l":
            if (mode === "PRODUCER") await promptJsonLoad();
            else addLog(colors.yellow("⚠️ Cambia a modo Productor primero"));
            break;
          case "r":
            stats.sent = 0;
            stats.received = 0;
            addLog("Contadores reseteados");
            break;
        }
        render();
      }
    } catch (_) {
      // Exit
    } finally {
      if (connection) await connection.close();
      console.clear();
      Deno.exit(0);
    }
  })();

  // Refresh
  while (isRunning) {
    render();
    await new Promise(r => setTimeout(r, 1000));
  }
}

main();
