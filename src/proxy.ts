// Next 16: proxy.ts (бывший middleware), исполняется в Node-рантайме — поэтому
// можно использовать полный auth (с БД): jwt-callback перепроверяет роль/статус
// и его обновления токена персистятся в cookie (в RSC Set-Cookie невозможен).
import { auth } from "@/auth";

export default auth;

export const config = {
  matcher: [
    // закрыто всё, кроме: auth-роутов, /login, /set-password, статики Next и файлов public/
    "/((?!api/auth|login|set-password|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml|webmanifest)$).*)",
  ],
};
