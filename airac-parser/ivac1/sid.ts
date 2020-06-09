import { SQL } from 'sql-template-strings';
import { Database } from 'sqlite';
import { convertPoint } from './latlon';
import { legsToPoints } from './utils/legs-to-points';
import pad from 'pad';

export const extractSID = async (
  db: Promise<Database>,
  airport: { airport_id: number; ident: string }
): Promise<string> => {
  let out = '';
  // Query for SIDs
  const sids = await (await db).all<
    {
      approach_id: number;
      fix_ident: string;
      runway_name: string;
      runway_end_id: number;
      arinc_name: string;
    }[]
  >(SQL`
    SELECT
      approach_id, fix_ident, runway_name, runway_end_id, arinc_name
    FROM
      approach
    WHERE
      type = 'GPS'
        AND
      has_gps_overlay = 1
        AND
      suffix = 'D'
        AND
      airport_id = ${airport.airport_id}
  `);
  const sid_ids = sids.map((sid) => sid.approach_id);
  if (sid_ids.length > 0) {
    console.log(`> Processing ${airport.ident} (${airport.airport_id})`);
    for (const sid_id of sid_ids) {
      const sid = sids.find((v) => v.approach_id === sid_id)!;
      const name = `${airport.ident}-${sid.arinc_name} ${sid.fix_ident}`;
      console.log(`>> Processing ${name} (${sid_id})`);
      // Find runway end coordinates
      const runway_end = (await (await db).get<{ end_type: string }>(SQL`
        SELECT
          end_type
        FROM
          runway_end
        WHERE
          runway_end_id = ${sid.runway_end_id}
      `))!;
      const field =
        runway_end.end_type === 'P' ? 'primary_end_id' : 'secondary_end_id';
      const other_field =
        runway_end.end_type === 'S' ? 'primary_end_id' : 'secondary_end_id';
      const runway = (await (await db).get<{
        other_end_id: number;
      }>(
        `
        SELECT
          ${other_field} as other_end_id
        FROM
          runway
        WHERE
          ${field} = ?
      `,
        [sid.runway_end_id]
      ))!;
      const other_runway_end_id = runway.other_end_id;
      const other_runway_end = (await (await db).get<{
        laty: number;
        lonx: number;
      }>(SQL`
        SELECT
          laty, lonx
        FROM
          runway_end
        WHERE
          runway_end_id = ${other_runway_end_id}
      `))!;
      // Query for legs
      const legs = await (await db).all<
        {
          leg_id: number;
          type: string;
          fix_ident: string;
        }[]
      >(SQL`
        SELECT
          approach_leg_id as leg_id, type, fix_ident
        FROM
          approach_leg
        WHERE
          approach_id = ${sid_id}
      `);
      const leg_points: string[] = await legsToPoints(legs);
      const points = [
        convertPoint([other_runway_end.laty, other_runway_end.lonx], true),
        ...leg_points
      ];
      for (let i = 0; i <= points.length - 2; i++) {
        const point_a = points[i];
        const point_b = points[i + 1];
        const prefix = i === 0 ? name : '';
        out += pad(prefix, 25) + ' ';
        out += pad(point_a, 29) + ' ';
        out += pad(point_b, 29) + '\n';
      }
    }
  }
  return out;
};
