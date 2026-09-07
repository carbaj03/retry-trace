import {readFile,writeFile} from 'node:fs/promises';
const path='dist/server/wrangler.json';
const config=JSON.parse(await readFile(path,'utf8'));
// Emitted by the installed Vite adapter; removed from current Wrangler.
delete config.legacy_env;
await writeFile(path,JSON.stringify(config));
