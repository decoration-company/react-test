import { Pixel9aCaseMaskPreview } from './pixel9a/Pixel9aCaseMaskPreview'
import { VerifyPreview } from './verify/VerifyPreview'
import './App.css'

function App() {
  const params = new URLSearchParams(window.location.search)
  const mode = params.get('mode')
  const variant = params.get('variant')

  if (mode === 'verify' && variant) {
    return (
      <main>
        <VerifyPreview variant={variant} />
      </main>
    )
  }

  return (
    <main id="center">
      <Pixel9aCaseMaskPreview />
    </main>
  )
}

export default App
