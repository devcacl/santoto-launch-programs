import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import bcrypt from 'bcryptjs';

function readHidden(prompt) {
  if (!stdin.isTTY || typeof stdin.setRawMode !== 'function') throw new Error('Ejecuta este comando en una terminal interactiva para ingresar la contraseña sin mostrarla.');
  stdout.write(prompt);
  stdin.setRawMode(true);
  stdin.resume();
  return new Promise((resolve, reject) => {
    let value = '';
    const onKey = (chunk) => {
      const key = chunk.toString();
      if (key === '\u0003') { cleanup(); reject(new Error('Operación cancelada.')); return; }
      if (key === '\r' || key === '\n') { cleanup(); stdout.write('\n'); resolve(value); return; }
      if (key === '\u007f' || key === '\b') { value = value.slice(0, -1); return; }
      if (key >= ' ') value += key;
    };
    function cleanup() { stdin.off('data', onKey); stdin.setRawMode(false); stdin.pause(); }
    stdin.on('data', onKey);
  });
}

const rl = createInterface({ input: stdin, output: stdout });
try {
  const email = (await rl.question('Correo institucional: ')).trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('El correo no tiene un formato válido.');
  const role = (await rl.question('Rol (admin, admissions, analyst): ')).trim();
  if (!['admin', 'admissions', 'analyst'].includes(role)) throw new Error('Rol no permitido.');
  rl.close();
  const password = await readHidden('Contraseña (mínimo 12 caracteres): ');
  if (password.length < 12 || password.length > 200) throw new Error('La contraseña debe tener entre 12 y 200 caracteres.');
  const passwordHash = await bcrypt.hash(password, 12);
  stdout.write(`${JSON.stringify({ email, role, passwordHash })}\n`);
} catch (error) {
  rl.close();
  console.error(error.message);
  process.exitCode = 1;
}
