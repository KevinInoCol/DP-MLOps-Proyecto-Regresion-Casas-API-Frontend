// Corrige el desalineamiento que produce la API.
//
// En la API:
//   datos_de_test.dropna(...)                       -> conserva índices originales K (con huecos)
//   predicciones = pipeline.predict(datos_de_test)  -> array de n = |K| valores
//   pd.concat([datos, pd.Series(predicciones)], axis=1)
//       la Serie tiene índice 0..n-1, así que pred[p] (la de la p-ésima casa
//       conservada) queda en la fila con etiqueta p, NO en la etiqueta K[p].
//   Orden del CSV de salida: primero las etiquetas de K (en orden) y luego las
//   etiquetas < n que no estaban en K (filas sin datos, en orden).
//
// Para reconstruirlo cruzamos las filas de salida con el CSV de entrada y
// recuperamos K (qué filas originales sobrevivieron al dropna).

const P = 'Predicciones_Sin_Escalar'
const L = 'Predicciones'
const NULOS = new Set(['', 'nan', 'NaN', 'NA', 'None', 'null', '<NA>'])

function norm(v) {
  const s = String(v ?? '').trim()
  if (NULOS.has(s)) return ''
  const n = Number(s)
  return s !== '' && !isNaN(n) ? String(n) : s
}

/**
 * @param entrada  registros del CSV enviado (array de objetos)
 * @param salida   { columnas, registros } del CSV devuelto por la API
 * @returns { filas, descartadas, alineado } — filas: casas con su predicción correcta
 */
export function alinearPredicciones(entrada, salida) {
  const { columnas, registros } = salida
  const colsDatos = columnas.filter((c) => c !== P && c !== L)
  const conDatos = registros.filter((r) => colsDatos.some((c) => r[c] !== ''))
  const sinDatos = registros.slice(conDatos.length) // filas huérfanas al final

  // Caso sin descartes: todo está alineado.
  if (conDatos.length === registros.length) {
    return { filas: registros.map((r, i) => ({ _n: i + 1, ...r })), descartadas: 0, alineado: true }
  }

  // 1) Recuperar K emparejando (subsecuencia en orden) salida ↔ entrada.
  const comunes = colsDatos.filter((c) => entrada.length && c in entrada[0])
  const K = []
  let j = 0
  for (let i = 0; i < entrada.length && j < conDatos.length; i++) {
    if (comunes.every((c) => norm(entrada[i][c]) === norm(conDatos[j][c]))) {
      K.push(i)
      j++
    }
  }
  const n = conDatos.length
  if (K.length !== n) {
    // No se pudo reconstruir: no mostramos predicciones potencialmente erróneas.
    return { filas: [], descartadas: entrada.length - n, alineado: false }
  }

  // 2) Mapear etiqueta -> fila de salida que la contiene.
  const filaPorEtiqueta = new Map()
  K.forEach((etq, pos) => filaPorEtiqueta.set(etq, conDatos[pos]))
  const enK = new Set(K)
  const huerfanas = []
  for (let etq = 0; etq < n; etq++) if (!enK.has(etq)) huerfanas.push(etq)
  huerfanas.forEach((etq, pos) => filaPorEtiqueta.set(etq, sinDatos[pos]))

  // 3) La predicción de la p-ésima casa conservada está en la etiqueta p.
  const filas = conDatos.map((r, p) => {
    const fuente = filaPorEtiqueta.get(p) || {}
    return { _n: K[p] + 1, ...r, [L]: fuente[L] ?? '', [P]: fuente[P] ?? '' }
  })
  return { filas, descartadas: entrada.length - n, alineado: true }
}
