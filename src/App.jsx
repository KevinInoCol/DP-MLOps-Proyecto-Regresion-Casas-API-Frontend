import { useEffect, useMemo, useRef, useState } from 'react'
import { predecir, healthcheck } from './api'
import { parseCSV } from './csv'
import { alinearPredicciones } from './alinear'

const COL_PRECIO = 'Predicciones_Sin_Escalar'
const COL_LOG = 'Predicciones'
// Columnas descriptivas que mostramos si vienen en la respuesta
const COLS_CLAVE = ['Id', 'Neighborhood', 'MSZoning', 'OverallQual', 'GrLivArea', 'YearRemodAdd', 'GarageCars']
const POR_PAGINA = 20

const usd = new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

export default function App() {
  const [estadoApi, setEstadoApi] = useState('verificando')
  const [archivo, setArchivo] = useState(null)
  const [arrastrando, setArrastrando] = useState(false)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')
  const [resultado, setResultado] = useState(null) // { blob, columnas, registros, descartadas, ms }
  const [orden, setOrden] = useState({ col: null, asc: true })
  const [pagina, setPagina] = useState(0)
  const [verTodas, setVerTodas] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => {
    healthcheck().then(() => setEstadoApi('ok')).catch(() => setEstadoApi('error'))
  }, [])

  function elegirArchivo(f) {
    setError('')
    setResultado(null)
    if (!f) return
    if (!f.name.toLowerCase().endsWith('.csv')) {
      setError('El archivo debe tener extensión .csv')
      return
    }
    setArchivo(f)
  }

  async function usarEjemplo() {
    const res = await fetch('/ejemplo_casas.csv')
    const blob = await res.blob()
    elegirArchivo(new File([blob], 'ejemplo_casas.csv', { type: 'text/csv' }))
  }

  async function enviar() {
    if (!archivo) return
    setCargando(true)
    setError('')
    setResultado(null)
    const t0 = performance.now()
    try {
      const entrada = parseCSV(await archivo.text()).registros
      const { texto } = await predecir(archivo)
      const salida = parseCSV(texto)
      // La API desalinea predicciones y casas cuando descarta filas con nulos
      // (ver src/alinear.js). Reconstruimos la correspondencia correcta.
      const { filas, descartadas, alineado } = alinearPredicciones(entrada, salida)
      if (!alineado) throw new Error('No se pudo emparejar la respuesta con el CSV enviado.')

      // Recuperamos el Id original (la API lo elimina)
      const conId = filas.map((r) => ({ ...r, Id: entrada[r._n - 1]?.Id ?? '' }))
      const columnas = ['Id', ...salida.columnas]
      const esc = (v) => (/[",\n]/.test(v) ? `"${String(v).replace(/"/g, '""')}"` : v)
      const csvCorregido = [columnas.join(','), ...conId.map((r) => columnas.map((c) => esc(r[c] ?? '')).join(','))].join('\n')

      setResultado({
        blob: new Blob([csvCorregido], { type: 'text/csv' }),
        columnas,
        registros: conId,
        descartadas, // filas que el modelo no pudo predecir (nulos)
        ms: Math.round(performance.now() - t0),
      })
      setPagina(0)
      setOrden({ col: null, asc: true })
    } catch (e) {
      setError(e.message || 'No se pudo obtener la predicción')
    } finally {
      setCargando(false)
    }
  }

  function descargar() {
    const url = URL.createObjectURL(resultado.blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'salida_datos_y_predicciones.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const stats = useMemo(() => {
    if (!resultado?.registros.length) return null
    const p = resultado.registros.map((r) => Number(r[COL_PRECIO])).sort((a, b) => a - b)
    const suma = p.reduce((a, b) => a + b, 0)
    const mediana = p.length % 2 ? p[(p.length - 1) / 2] : (p[p.length / 2 - 1] + p[p.length / 2]) / 2
    // Histograma de 12 cubetas
    const min = p[0], max = p[p.length - 1]
    const n = 12
    const ancho = (max - min) / n || 1
    const cubetas = Array.from({ length: n }, (_, i) => ({ desde: min + i * ancho, hasta: min + (i + 1) * ancho, c: 0 }))
    p.forEach((v) => { cubetas[Math.min(n - 1, Math.floor((v - min) / ancho))].c++ })
    return { total: p.length, promedio: suma / p.length, mediana, min, max, cubetas }
  }, [resultado])

  const columnasTabla = useMemo(() => {
    if (!resultado) return []
    const base = verTodas
      ? resultado.columnas.filter((c) => c !== COL_PRECIO && c !== COL_LOG)
      : COLS_CLAVE.filter((c) => resultado.columnas.includes(c))
    return ['Id', ...base.filter((c) => c !== 'Id'), COL_LOG, COL_PRECIO]
  }, [resultado, verTodas])

  const filasOrdenadas = useMemo(() => {
    if (!resultado) return []
    const filas = [...resultado.registros]
    if (orden.col) {
      filas.sort((a, b) => {
        const x = a[orden.col], y = b[orden.col]
        const nx = Number(x), ny = Number(y)
        const cmp = !isNaN(nx) && !isNaN(ny) && x !== '' && y !== '' ? nx - ny : String(x).localeCompare(String(y))
        return orden.asc ? cmp : -cmp
      })
    }
    return filas
  }, [resultado, orden])

  const totalPaginas = Math.max(1, Math.ceil(filasOrdenadas.length / POR_PAGINA))
  const visibles = filasOrdenadas.slice(pagina * POR_PAGINA, (pagina + 1) * POR_PAGINA)

  function ordenarPor(col) {
    setOrden((o) => ({ col, asc: o.col === col ? !o.asc : col === COL_PRECIO ? false : true }))
    setPagina(0)
  }

  const maxCubeta = stats ? Math.max(...stats.cubetas.map((c) => c.c)) : 1

  return (
    <div className="app">
      <header className="cabecera">
        <div>
          <h1>🏠 Predicción de Precios de Casas</h1>
          <p className="sub">Modelo de regresión desplegado en Google Cloud Run · Lasso + feature-engine</p>
        </div>
        <span className={`pill pill-${estadoApi}`}>
          <span className="punto" />
          {estadoApi === 'ok' ? 'API en línea' : estadoApi === 'error' ? 'API sin respuesta' : 'Verificando API…'}
        </span>
      </header>

      <section className="tarjeta">
        <h2>1. Sube tus datos</h2>
        <p className="ayuda">
          CSV con el formato del dataset <b>House Prices (Kaggle) – test.csv</b>: debe incluir la columna <code>Id</code> y las
          variables del modelo (<code>MSSubClass</code>, <code>Neighborhood</code>, <code>OverallQual</code>, <code>GrLivArea</code>…).
        </p>

        <div
          className={`zona ${arrastrando ? 'zona-activa' : ''} ${archivo ? 'zona-lista' : ''}`}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setArrastrando(true) }}
          onDragLeave={() => setArrastrando(false)}
          onDrop={(e) => { e.preventDefault(); setArrastrando(false); elegirArchivo(e.dataTransfer.files[0]) }}
        >
          <input ref={inputRef} type="file" accept=".csv,text/csv" hidden onChange={(e) => elegirArchivo(e.target.files[0])} />
          {archivo ? (
            <>
              <div className="icono">📄</div>
              <div className="nombre">{archivo.name}</div>
              <div className="meta">{(archivo.size / 1024).toFixed(1)} KB · haz clic para cambiarlo</div>
            </>
          ) : (
            <>
              <div className="icono">⬆️</div>
              <div className="nombre">Arrastra tu CSV aquí o haz clic para seleccionarlo</div>
            </>
          )}
        </div>

        <div className="acciones">
          <button className="btn btn-primario" disabled={!archivo || cargando} onClick={enviar}>
            {cargando ? <><span className="spinner" /> Prediciendo…</> : 'Predecir precios'}
          </button>
          <button className="btn" onClick={usarEjemplo} disabled={cargando}>Usar CSV de ejemplo</button>
          <a className="enlace" href="/ejemplo_casas.csv" download>Descargar plantilla</a>
        </div>

        {error && <div className="alerta">⚠️ {error}</div>}
      </section>

      {resultado && stats && (
        <>
          <section className="kpis">
            <Kpi titulo="Casas predichas" valor={stats.total.toLocaleString('es-PE')} nota={resultado.descartadas ? `${resultado.descartadas} descartadas por datos faltantes` : `en ${resultado.ms} ms`} />
            <Kpi titulo="Precio promedio" valor={usd.format(stats.promedio)} />
            <Kpi titulo="Mediana" valor={usd.format(stats.mediana)} />
            <Kpi titulo="Rango" valor={`${usd.format(stats.min)} – ${usd.format(stats.max)}`} pequeño />
          </section>

          <section className="tarjeta">
            <h2>2. Distribución de precios predichos</h2>
            <div className="histograma">
              {stats.cubetas.map((c, i) => (
                <div key={i} className="barra-wrap" title={`${usd.format(c.desde)} – ${usd.format(c.hasta)}: ${c.c} casas`}>
                  <span className="barra-n">{c.c || ''}</span>
                  <div className="barra" style={{ height: `${(c.c / maxCubeta) * 100}%` }} />
                </div>
              ))}
            </div>
            <div className="eje">
              <span>{usd.format(stats.min)}</span>
              <span>{usd.format(stats.max)}</span>
            </div>
          </section>

          <section className="tarjeta">
            <div className="tabla-cabecera">
              <h2>3. Resultados</h2>
              <div className="acciones">
                <label className="check">
                  <input type="checkbox" checked={verTodas} onChange={(e) => setVerTodas(e.target.checked)} /> Ver todas las columnas
                </label>
                <button className="btn btn-primario" onClick={descargar}>⬇ Descargar CSV</button>
              </div>
            </div>

            <div className="tabla-scroll">
              <table>
                <thead>
                  <tr>
                    {columnasTabla.map((c) => (
                      <th key={c} onClick={() => ordenarPor(c)} className={c === COL_PRECIO ? 'col-precio' : ''}>
                        {c === COL_PRECIO ? 'Precio estimado' : c === COL_LOG ? 'log(Precio)' : c}
                        {orden.col === c ? (orden.asc ? ' ▲' : ' ▼') : ''}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibles.map((r) => (
                    <tr key={r._n}>
                      {columnasTabla.map((c) => (
                        <td key={c} className={c === COL_PRECIO ? 'col-precio' : ''}>
                          {c === COL_PRECIO ? usd.format(Number(r[c])) : c === COL_LOG ? Number(r[c]).toFixed(4) : r[c]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="paginacion">
              <button className="btn" disabled={pagina === 0} onClick={() => setPagina((p) => p - 1)}>← Anterior</button>
              <span>Página {pagina + 1} de {totalPaginas}</span>
              <button className="btn" disabled={pagina >= totalPaginas - 1} onClick={() => setPagina((p) => p + 1)}>Siguiente →</button>
            </div>
          </section>
        </>
      )}

      <footer>Kevin Inofuente · MLOps · Datapath</footer>
    </div>
  )
}

function Kpi({ titulo, valor, nota, pequeño }) {
  return (
    <div className="kpi">
      <div className="kpi-titulo">{titulo}</div>
      <div className={`kpi-valor ${pequeño ? 'kpi-pequeno' : ''}`}>{valor}</div>
      {nota && <div className="kpi-nota">{nota}</div>}
    </div>
  )
}
