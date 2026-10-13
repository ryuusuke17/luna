import argon2 from "argon2";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { db } from "./db";

const hash = (token: string) => createHash("sha256").update(token).digest("hex");
export async function setupOwner(username: string, password: string, setupToken?: string) {
  if (!/^[a-zA-Z0-9_.-]{3,40}$/.test(username) || password.length < 12 || password.length > 200) throw new Error("Use a 3–40 character username and password of at least 12 characters");
  const count = (db.prepare("SELECT count(*) n FROM users").get() as {n:number}).n;
  if (count && (process.env.NODE_ENV === "production" && (!process.env.LUNA_SETUP_TOKEN || !setupToken || !timingSafeEqual(Buffer.from(setupToken),Buffer.from(process.env.LUNA_SETUP_TOKEN))))) throw new Error("Owner setup is closed");
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  return Number(db.prepare("INSERT INTO users(username,password_hash) VALUES(?,?)").run(username,passwordHash).lastInsertRowid);
}
export async function login(username: string, password: string) {
  const user = db.prepare("SELECT id,password_hash FROM users WHERE username=?").get(username) as {id:number;password_hash:string}|undefined;
  if (!user || !await argon2.verify(user.password_hash,password)) throw new Error("Invalid username or password");
  const token = randomBytes(32).toString("base64url");
  db.prepare("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)").run(hash(token),user.id,new Date(Date.now()+7*86400000).toISOString());
  return token;
}
export function session(token?: string) {
  if (!token) return null;
  return db.prepare("SELECT u.id,u.username FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>CURRENT_TIMESTAMP").get(hash(token)) as {id:number;username:string}|undefined ?? null;
}
export function logout(token?: string) { if (token) db.prepare("DELETE FROM sessions WHERE token_hash=?").run(hash(token)); }
