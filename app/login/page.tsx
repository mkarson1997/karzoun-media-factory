export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const params = await searchParams;
  return (
    <div className="login-shell">
      <div className="card login-card">
        <div className="eyebrow">KARZOUN</div>
        <h1>Media Factory</h1>
        <p className="muted">Single-operator control room. Enter the APP_SECRET configured on the server.</p>
        {params.error ? <div className="notice login-error">Incorrect secret.</div> : null}
        <form className="form-stack" action="/api/auth/login" method="post">
          <input type="hidden" name="next" value={params.next?.startsWith('/') ? params.next : '/dashboard'} />
          <label>Operator secret<input className="input" type="password" name="secret" autoComplete="current-password" required autoFocus /></label>
          <button className="button" type="submit">Open factory</button>
        </form>
      </div>
    </div>
  );
}
