import Database from 'better-sqlite3';
import argon2 from 'argon2';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
const location=resolve(process.env.LUNA_DB_PATH||'./data/luna.sqlite');
await mkdir(dirname(location),{recursive:true});
const db=new Database(location);db.pragma('foreign_keys=ON');db.exec(`CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY,username TEXT UNIQUE NOT NULL,password_hash TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);`);
const rl=createInterface({input:stdin,output:stdout});
try { const username=(await rl.question('Owner username: ')).trim();const password=await rl.question('Owner password (min 12 chars): ');if(!/^[a-zA-Z0-9_.-]{3,40}$/.test(username)||password.length<12)throw new Error('Invalid username or password length');const hash=await argon2.hash(password,{type:argon2.argon2id});db.prepare('INSERT INTO users(username,password_hash) VALUES(?,?)').run(username,hash);stdout.write('Owner created.\n'); } finally {rl.close();db.close()}
