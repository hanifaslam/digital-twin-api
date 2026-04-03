INSERT INTO "Permission" ("id", "name", "module_id", "created_at")
SELECT 'perm_helper_' || md5(random()::text || clock_timestamp()::text), 'HELPER', m."id", NOW()
FROM "Module" m
WHERE m."code" = 'master'
  AND NOT EXISTS (
    SELECT 1
    FROM "Permission" p
    WHERE p."name" = 'HELPER'
  );

INSERT INTO "Role" ("id", "name", "code", "status", "created_at")
SELECT 'role_helper_' || md5(random()::text || clock_timestamp()::text), 'Helper', 'HLP', true, NOW()
WHERE NOT EXISTS (
  SELECT 1
  FROM "Role" r
  WHERE r."code" = 'HLP'
     OR r."name" = 'Helper'
);

INSERT INTO "RolePermission" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "Role" r
CROSS JOIN "Permission" p
WHERE (r."code" = 'HLP' OR r."name" = 'Helper')
  AND p."name" IN ('DASHBOARD', 'HELPER')
  AND NOT EXISTS (
    SELECT 1
    FROM "RolePermission" rp
    WHERE rp."role_id" = r."id"
      AND rp."permission_id" = p."id"
  );
