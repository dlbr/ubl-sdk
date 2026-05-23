import crypto from 'node:crypto';
import https from 'https';

async function pingSandbox() {
    console.log("Pinging MFIN Sandbox...");
    // Primer logike - ovde implementiraj svoj ping
    console.log("Ping successful.");
}

pingSandbox().catch(err => {
    console.error(err);
    process.exit(1);
});
