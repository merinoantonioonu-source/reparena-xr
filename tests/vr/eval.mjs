// Para preparar una prueba en la VR simulada: ejecuta en la página del juego la expresión de RX_EVAL (con window.__rx a
// mano) y escribe lo que devuelve. Solo para preparar el escenario (adelantar el descanso, sacar las cartas…); lo que se
// prueba se hace con las gafas y los mandos emulados.
//   RX_EVAL='__rx.snapshot().phase' npx @iwsdk/cli browser run tests/vr/eval.mjs
// (el servidor, con «npx @iwsdk/cli dev up --headless --allow-browser-automation»)
export default async function run({ page, frame }) {
  const code = process.env.RX_EVAL || '__rx.snapshot()';
  const out = await (frame ?? page).evaluate((c) => {
    const r = new Function('__rx', `return (${c});`)(window.__rx);
    return JSON.stringify(r ?? null);
  }, code);
  console.log(out);
  return out;
}
