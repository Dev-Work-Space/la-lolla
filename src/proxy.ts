import { NextResponse, type NextRequest } from "next/server";

const PUBLICAS = ["/login", "/api/health"];

/*
  * O proxy (era "middleware" ate o Next 15) roda no Edge, a cada requisição, ANTES de tudo. Por isso ele
 * só checa a PRESENÇA do cookie: validar a sessão exige consultar o banco, e
 * fazer isso a cada requisição (inclusive de imagem) seria caro e lento.
 *
 * A validação de verdade — sessão existe, não expirou, usuário está ativo —
 * acontece no guard, dentro da página ou da action. Este aqui é só o porteiro
 * que evita renderizar a tela para quem nem cookie tem.
 */
export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLICAS.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.next();
  }

  if (!req.cookies.get("lalolla_sessao")) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    // Guarda para onde a pessoa queria ir, e devolve depois do login.
    if (pathname !== "/") url.searchParams.set("de", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|webp|svg|ico)$).*)"],
};
