'use client';

export function LogoutForm() {
  return (
    <form action="/api/auth/logout" method="post">
      <button className="button secondary" type="submit">Sign out</button>
    </form>
  );
}
