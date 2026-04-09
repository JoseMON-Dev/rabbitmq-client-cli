# 🐇 Rabbit Load Tool

Una herramienta de terminal (TUI) ligera y potente escrita en **Deno** para pruebas de carga y depuración de colas en **RabbitMQ**. Permite actuar como productor o consumidor de mensajes de forma dinámica.

![Deno](https://img.shields.io/badge/Deno-white?style=flat&logo=deno&logoColor=black)
![RabbitMQ](https://img.shields.io/badge/RabbitMQ-FF6600?style=flat&logo=rabbitmq&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-blue.svg)

## 🚀 Características

-   **Modo Dual**: Cambia instantáneamente entre modo Productor (enviar) y Consumidor (recibir).
-   **Ráfagas de Mensajes**: Envía ráfagas configurables para pruebas de estrés.
-   **Carga de JSON**: Permite pegar y enviar objetos JSON personalizados.
-   **Interfaz Visual (TUI)**: Tabla de estadísticas en tiempo real y logs de actividad integrados.
-   **Multiplataforma**: Binarios disponibles para Windows y Linux.

## 📦 Instalación

Puedes descargar los binarios precompilados directamente desde la sección de **[Releases](https://github.com/tu-usuario/tu-repo/releases)**.

### Windows
1. Descarga `rabbit-windows.exe`.
2. Renómbralo a `rabbit.exe` (opcional).
3. Ejecútalo desde PowerShell o CMD.

### Linux
1. Descarga `rabbit-linux`.
2. Dale permisos de ejecución: `chmod +x rabbit-linux`.
3. Ejecútalo: `./rabbit-linux`.

## 🛠️ Uso (Desarrollo)

Si tienes [Deno](https://deno.com/) instalado, puedes ejecutarlo directamente sin compilar:

```bash
deno run --allow-net --allow-read rabbit.ts
```

## 🎮 Controles de la Interfaz

| Tecla | Acción |
| :--- | :--- |
| `P` | Cambiar a modo **Productor** |
| `C` | Cambiar a modo **Consumidor** |
| `S` | Enviar **un** mensaje aleatorio (solo Productor) |
| `B` | Enviar **ráfaga** de mensajes (configurada al inicio) |
| `L` | Cargar y enviar un **JSON String** personalizado |
| `R` | Reiniciar contadores de estadísticas |
| `Q` | Salir de la aplicación |

## ⚙️ Configuración Inicial

Al iniciar, la herramienta solicitará:
1.  **URL de RabbitMQ**: (Ej: `amqp://guest:guest@localhost:5672`)
2.  **Cola**: Nombre de la cola a utilizar.
3.  **Burst Size**: Cantidad de mensajes a enviar cuando se presiona `B`.

---
Desarrollado con ❤️ usando Deno y Cliffy.
