import './TigersEditor.css'

export function TigersAccessDenied({ reason }: { reason?: string }) {
  return (
    <section className="tigers-access-denied">
      <h1>タイガースエディタ</h1>
      <p>{reason ?? 'このページにはアクセスできません。'}</p>
    </section>
  )
}
