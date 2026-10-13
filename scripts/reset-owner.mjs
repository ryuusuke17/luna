import Database from 'better-sqlite3';
import argon2 from 'argon2';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
const db=new Database(resolve(process.env.LUNA_DB_PATH||'./data/luna.sqlite'));
const rl=createInterface({input:stdin,output:stdout});
try {const username=(await rl.question('Owner username: ')).trim();const password=await rl.question('New password (min 12 chars): ');if(!/^[a-zA-Z0-9_.-]{3,40}$/.test(username)||password.length<12||password.length>200)throw new Error('Invalid username or password length');const hash=await argon2.hash(password,{type:argon2.argon2id});const update=db.transaction(()=>{const result=db.prepare('UPDATE users SET password_hash=? WHERE username=?').run(hash,username);if(!result.changes)throw new Error('Owner not found');db.prepare('DELETE FROM sessions').run()});update();stdout.write('Password updated; all sessions revoked.\n')} finally {rl.close();db.close()}
