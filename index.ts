import dotenv from 'dotenv';
import knex from 'knex';

// Example .env file:
// NODE_TLS_REJECT_UNAUTHORIZED=0
// ORCA_URL=https://staging-api-orchestrator.dispel.io
// ORCA_TOKEN=XXXXXXXXXXXXXXXXXXXXXXX
// ORCA_DB_URL=postgresql://username:password@hostname:5432/postgres
// IGNORED_WICKET_IDS=1,2,3
// IGNORED_VDI_IMAGE_IDS=1,2,3
dotenv.config();

const ignoredWickets = (process.env.IGNORED_WICKET_IDS ?? '').split(',').filter(id => id).map(Number);
const ignoredVdiImages = (process.env.IGNORED_VDI_IMAGE_IDS ?? '').split(',').filter(id => id).map(Number);

const db = knex({
  client: 'pg',
  connection: {
    ssl: true,
    connectionString: process.env.ORCA_DB_URL,
  },
});

async function activateWicket() {
  const wickets = (await db('wickets').where({ status: 'creating' }))
    .filter(wicket => !ignoredWickets.includes(wicket.id));
  if(!wickets.length) {
    return;
  }

  const wicketId = wickets[0]!.id;

  console.log(`Activating wicket ${wicketId}`);

  const wicket = await fetch(`${process.env.ORCA_URL}/v2.0/wickets/${wicketId}`, {
    headers: {
      authorization: `Bearer ${process.env.ORCA_TOKEN}`,
    },
  });
  if((await wicket.json()).status !== 'creating') {
    throw new Error('Wicket is not in creating status!');
  }
  const generate = await fetch(`${process.env.ORCA_URL}/v2.0/wickets/${wicketId}/generate-script`, {
    method: 'POST',
    body: JSON.stringify({
      external_customer_interface: {
        name: 'Auto-activated Wicket',
        enable_dhcp: true,
      },
    }),
    headers: {
      authorization: `Bearer ${process.env.ORCA_TOKEN}`,
      'Content-Type': 'application/json',
    },
  });
  console.log(await generate.text());
  if(!generate.ok) {
    throw new Error(`Wicket generation failed with status ${generate.status}`);
  }
  console.log('Waiting for script generation to finish...');
  await new Promise(resolve => setTimeout(resolve, 1000 * 60));

  await db('wickets')
    .where({ id: wicketId })
    .update({ status: 'active' })
    .returning('*');

  console.log(`Wicket ${wicketId} activated`);
}

async function activateVdiImage() {
  const vdiImages = (await db('vdi_images').where({ status: 'creating' }))
    .filter(vdiImage => !ignoredVdiImages.includes(vdiImage.id));
  if(!vdiImages.length) {
    return;
  }

  const vdiImageId = vdiImages[0]!.id;

  console.log(`Activating VDI Image ${vdiImageId}`);

  const vdiImage = await fetch(`${process.env.ORCA_URL}/v2.0/vdi-images/${vdiImageId}`, {
    headers: {
      authorization: `Bearer ${process.env.ORCA_TOKEN}`,
    },
  });
  if((await vdiImage.json()).status !== 'creating') {
    throw new Error('VDI Image is not in creating status!');
  }

  await db('vdi_images')
    .where({ id: vdiImageId })
    .update({ resource_uri: 'vdi-image/versions/0.0.3', status: 'active' })
    .returning('*');

  console.log(`VDI Image ${vdiImageId} activated`);
}

async function main() {
  while(true) {
    await activateWicket();
    await activateVdiImage();
    await new Promise(resolve => setTimeout(resolve, 1000 * 10));
  }

  // db.destroy();
}

main();
