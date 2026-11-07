// Parser CSV mínimo (soporta comillas y comas dentro de campos).
export function parseCSV(texto) {
  const filas = []
  let fila = []
  let campo = ''
  let enComillas = false

  for (let i = 0; i < texto.length; i++) {
    const c = texto[i]
    if (enComillas) {
      if (c === '"') {
        if (texto[i + 1] === '"') { campo += '"'; i++ } else enComillas = false
      } else campo += c
    } else if (c === '"') enComillas = true
    else if (c === ',') { fila.push(campo); campo = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++
      fila.push(campo); filas.push(fila); fila = []; campo = ''
    } else campo += c
  }
  if (campo !== '' || fila.length) { fila.push(campo); filas.push(fila) }

  const [cabecera = [], ...resto] = filas.filter((f) => f.some((v) => v !== ''))
  const registros = resto.map((f) => Object.fromEntries(cabecera.map((h, j) => [h, f[j] ?? ''])))
  return { columnas: cabecera, registros }
}
