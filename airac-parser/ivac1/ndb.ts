import * as sqlite3 from 'sqlite3';
import { resolve } from 'path';
import { Coordinate, convertCoordinate, convertPoint } from './latlon';
import { writeFileSync, ensureDirSync } from 'fs-extra';

const basePath = resolve(__dirname);
const buildPath = resolve(basePath, 'build', '03-NDB');

ensureDirSync(buildPath);

const db = new sqlite3.Database(
  resolve(basePath, '..' , 'little_navmap_navigraph.sqlite')
);

let inclusion: string[] = [];

if (process.env['INSIDE_ONLY'] === 'true') {
  console.log('This is going to get data inside Bangkok FIR only, be sure to run the IvAc sector file checker.');
  inclusion = [];
}

const query = (db: sqlite3.Database, queryStr: string): Promise<any> => {
  return new Promise((resolve, reject) => {
    db.get(queryStr, (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
};

const main = async () => {
  db.all(
    `
    SELECT
    ident, name, frequency, laty, lonx
    FROM
    ndb
    WHERE
    region = 'VT'
    `,
    async (
      err: any,
      rows: {
        ident: string;
        name: string;
        frequency: number;
        laty: number;
        lonx: number;
      }[]
    ) => {
      let out = '';
      let outNearby = '';
      const padder1 = '       ';
      const padder2 = '000';
      for (let i = 0; i <= rows.length - 1; i++) {
        const row = rows[i];
        out += (row.ident + padder1).substr(0, 6);
        const num1 = Math.floor(row.frequency / 100);
        const num2 = row.frequency % 100;
        out += `${num1}.${(num2 + padder2).substr(0, 3)} `;
        out += convertPoint([row.laty, row.lonx], true);
        out += ` ;- ${row.name}`;
        out += '\n';
      }

      outNearby += ';- Followings are NDB outside Bangkok FIR\n';

      for (let ndb of inclusion) {
        const data = await query(
          db,
          `
        SELECT
        *
        FROM
        ndb
        WHERE
        ident = '${ndb}'
        AND
        (
          region LIKE 'V%'
          OR
          region LIKE 'W%'
        )
        `
        );
        outNearby += (data.ident + padder1).substr(0, 6);
        const num1 = Math.floor(data.frequency / 100);
        const num2 = data.frequency % 100;
        outNearby += `${num1}.${(num2 + padder2).substr(0, 3)} `;
        outNearby += convertPoint([data.laty, data.lonx], true);
        outNearby += ` ;- ${data.name}`;
        outNearby += '\n';
      }
      writeFileSync(resolve(buildPath, '02-THAI.txt'), out);
      writeFileSync(resolve(buildPath, '03-NEARBY.txt'), outNearby);
    }
  );
};

main().then(() => console.log('Done'));
