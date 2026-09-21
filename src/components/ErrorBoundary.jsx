import { Component } from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'

// Render xatosini ushlab, oq ekran o'rniga tushunarli xato sahifasini ko'rsatadi.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    // Ishlab chiqarishda bu yerda log xizmatiga yuborilishi mumkin
    console.error('UI xatosi:', error, info)
  }

  render() {
    if (!this.state.error) return this.props.children
    const message = this.state.error?.message || 'Nomaʼlum xatolik'
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4 dark:bg-slate-950">
        <div className="card w-full max-w-md p-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-100 text-red-600 dark:bg-red-500/15">
            <AlertTriangle className="h-7 w-7" />
          </div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Xatolik yuz berdi</h1>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            Sahifani qayta yuklab ko'ring. Muammo davom etsa, dasturchiga xabar bering.
          </p>
          <button onClick={() => window.location.reload()} className="btn-primary mx-auto mt-5">
            <RotateCcw className="h-4 w-4" /> Qayta yuklash
          </button>
          <details className="mt-5 text-left">
            <summary className="cursor-pointer text-xs text-slate-400">Texnik ma'lumot</summary>
            <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-100 p-3 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              {message}
              {this.state.error?.stack ? '\n\n' + this.state.error.stack : ''}
            </pre>
          </details>
        </div>
      </div>
    )
  }
}
