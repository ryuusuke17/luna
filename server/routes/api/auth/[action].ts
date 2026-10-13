import { defineHandler } from "nitro";
import { readBody, getCookie, setCookie, deleteCookie, createError } from "nitro/h3";
import { login, logout, session, setupOwner } from "../../../lib/auth";

export default defineHandler(async (event) => {
  const action = event.context.params?.action;
  const body = await readBody<any>(event);
  try {
    if (action === "setup") {
      const id = await setupOwner(String(body?.username ?? ""),String(body?.password ?? ""),String(body?.setupToken ?? ""));
      return { id };
    }
    if (action === "login") {
      const token = await login(String(body?.username ?? ""),String(body?.password ?? ""));
      setCookie(event,"luna_session",token,{httpOnly:true,sameSite:"strict",secure:process.env.NODE_ENV === "production",path:"/",maxAge:604800});
      return { ok:true };
    }
    if (action === "logout") { logout(getCookie(event,"luna_session")); deleteCookie(event,"luna_session",{path:"/"}); return {ok:true}; }
    if (action === "me") return { user:session(getCookie(event,"luna_session")) };
    throw createError({statusCode:404,statusMessage:"Not found"});
  } catch (error) { throw createError({statusCode:400,statusMessage:error instanceof Error ? error.message : "Request failed"}); }
});
