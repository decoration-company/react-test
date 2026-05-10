import { Pixel9aCaseMaskPreview } from './pixel9a/Pixel9aCaseMaskPreview'
import { GarupanEditor } from './garupan/GarupanEditor'
import { RenderTestPage } from './test/RenderTestPage'
import { TigersEditor } from './tigers/TigersEditor'
import { VerifyPreview } from './verify/VerifyPreview'
import './App.css'

function App() {
  const path = window.location.pathname
  const params = new URLSearchParams(window.location.search)
  const mode = params.get('mode')
  const variant = params.get('variant')

  if (path === '/test/render') {
    return <RenderTestPage />
  }

  if (mode === 'verify' && variant) {
    return (
      <main>
        <VerifyPreview variant={variant} />
      </main>
    )
  }

  if (path === '/tigers') {
    return <TigersEditor variant={variant} />
  }

  if (path === '/garupan') {
    return <GarupanEditor variant={variant} />
  }

  return (
    <main id="center">
      <Pixel9aCaseMaskPreview variant={variant} />
    </main>
  )
}

export default App
