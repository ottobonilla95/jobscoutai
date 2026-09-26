import {brand} from '../../../packages/core/src/brand';
import { runScheduled } from '../../../packages/core/src/scheduler';
const args=process.argv.slice(2);const forceUserId=args.includes('--force')?args[args.indexOf('--user')+1]:undefined;
if(args.includes('--force')&&(!args.includes('--user')||!forceUserId||forceUserId.startsWith('--')))throw new Error('An immediate run requires --force --user <account-id>.');
async function tick(){
 try{const result=await runScheduled({forceUserId});console.log(JSON.stringify({application:brand.name,...result}));if(result.status==='failed')process.exitCode=1;}
 catch{console.error(`${brand.name}: Worker failed. Check account database and service configuration.`);process.exitCode=1;}
}
if(args.includes('--watch')){
 console.log(`${brand.name}: Worker scheduler started. Checks account searches every minute.`);
 while(true){await tick();await new Promise(resolve=>setTimeout(resolve,60000));}
}else await tick();
