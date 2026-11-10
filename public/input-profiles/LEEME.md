# Modelos de las manos y de los mandos

Los modelos con los que IWSDK pinta las manos (seguimiento de manos) y los mandos, copiados del paquete
[`@webxr-input-profiles/assets`](https://github.com/immersive-web/webxr-input-profiles) 1.0.20 (licencia MIT, en
`LICENSE.md`):

| Carpeta | Qué es |
| --- | --- |
| `generic-hand/` | Las manos (izquierda y derecha) |
| `meta-quest-touch-plus/` | Los mandos de las Quest 3 |
| `oculus-touch-v3/` | Los mandos de las Quest 2 |

IWSDK los descarga de internet (cdn.jsdelivr.net); el juego los sirve desde aquí (`src/input-models.ts`), así no
depende de esa descarga. Cualquier otro mando se sigue descargando de internet.
