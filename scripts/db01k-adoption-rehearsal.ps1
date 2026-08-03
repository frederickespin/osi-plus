$ErrorActionPreference = 'Stop'

function Assert-LastExitCode([string]$operation) {
  if ($LASTEXITCODE -ne 0) { throw "$operation falló con código $LASTEXITCODE" }
}

$line = Get-Content '.env.db01e.local' | Where-Object { $_ -like 'DB01C_DATABASE_URL=*' } | Select-Object -First 1
if (-not $line) { throw 'Falta la conexión local de laboratorio.' }
$raw = $line.Substring($line.IndexOf('=') + 1).Trim().Trim('"').Trim("'")
$parsed = [UriBuilder]$raw
$databaseName = 'osi_db01c_db01k_adoption_20260801'
if ($parsed.Host -notin @('127.0.0.1', 'localhost') -or $parsed.Port -ne 55432 -or -not $databaseName.StartsWith('osi_db01c_')) {
  throw 'DB-01K rechazó una conexión que no es local y aislada.'
}

$admin = [UriBuilder]$raw
$admin.Path = '/postgres'
$admin.Query = ''
$target = [UriBuilder]$raw
$target.Path = "/$databaseName"
$target.Query = 'schema=osi'
$plain = [UriBuilder]$target.Uri.AbsoluteUri
$plain.Query = ''
$plainUrl = $plain.Uri.AbsoluteUri
$postgresBin = 'C:\Program Files\PostgreSQL\18\bin'
$psql = Join-Path $postgresBin 'psql.exe'
$pgDump = Join-Path $postgresBin 'pg_dump.exe'
$pgRestore = Join-Path $postgresBin 'pg_restore.exe'
$backup = Join-Path ([IO.Path]::GetTempPath()) 'osi_db01k_adoption_pre.dump'

& $psql $admin.Uri.AbsoluteUri -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS $databaseName WITH (FORCE);" | Out-Null
Assert-LastExitCode 'drop inicial'
& $psql $admin.Uri.AbsoluteUri -v ON_ERROR_STOP=1 -c "CREATE DATABASE $databaseName;" | Out-Null
Assert-LastExitCode 'create inicial'
& $psql $plain.Uri.AbsoluteUri -v ON_ERROR_STOP=1 -f 'prisma/migrations/20260801000000_production_baseline/migration.sql' | Out-Null
Assert-LastExitCode 'baseline estructural'
& $psql $plain.Uri.AbsoluteUri -v ON_ERROR_STOP=1 -f 'prisma/db01/adoption-simulation/legacy-histories.synthetic.sql' | Out-Null
Assert-LastExitCode 'historias sintéticas'

$env:DB01C_DATABASE_URL = $target.Uri.AbsoluteUri
$env:DATABASE_URL = $target.Uri.AbsoluteUri
$env:DIRECT_URL = $target.Uri.AbsoluteUri
node scripts/db01c-synthetic-users.mjs | Out-Null
Assert-LastExitCode 'usuarios sintéticos'

$commercialFixture = @'
INSERT INTO osi.osi_clients(id,code,name,email,phone,address,type,status,"createdAt")
VALUES ('db01k-client-1','DB01K-CLIENT-001','Synthetic Client','client@example.invalid','+10000000999','Synthetic address','PERSONAL','active','2026-08-01');
INSERT INTO osi.osi_pipeline_cases(id,"caseCode","clientName",mode,"serviceType","customerType",status,"ownerName","originLocation","destinationLocation")
VALUES ('db01k-case-1','DB01K-CASE-001','Synthetic Client','LOCAL','LOCAL_MOVE','L4_PERSONAL','PRICING_IN_PROGRESS','Synthetic Owner','Synthetic origin','Synthetic destination');
'@
$commercialFixture | & $psql $plain.Uri.AbsoluteUri -v ON_ERROR_STOP=1 -f - | Out-Null
Assert-LastExitCode 'fixture comercial'

& $pgDump $plain.Uri.AbsoluteUri --format=custom --no-owner --no-privileges --file=$backup
Assert-LastExitCode 'backup preadopción'
$backupHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $backup).Hash.ToLowerInvariant()

$preQuery = @'
SELECT (SELECT count(*) FROM osi.osi_clients WHERE code='DB01K-CLIENT-001'),
       (SELECT count(*) FROM osi.osi_pipeline_cases WHERE "caseCode"='DB01K-CASE-001'),
       (SELECT count(*) FROM public._prisma_migrations),
       (SELECT count(*) FROM osi._prisma_migrations),
       (SELECT count(*) FROM osi.osi_users);
'@
$pre = $preQuery | & $psql $plain.Uri.AbsoluteUri -At -F '|' -f -
Assert-LastExitCode 'lectura preadopción'

& $psql $plain.Uri.AbsoluteUri -v ON_ERROR_STOP=1 -f 'prisma/db01/adoption-simulation/preserve-legacy-histories.sql' | Out-Null
Assert-LastExitCode 'preservación de historias'
npx prisma migrate resolve --applied 20260801000000_production_baseline --schema prisma/schema.prisma | Out-Null
Assert-LastExitCode 'registro administrativo del baseline'
npx prisma migrate deploy --schema prisma/schema.prisma | Out-Null
Assert-LastExitCode 'deploy posterior al baseline'
node scripts/db01c-backfill.mjs | Out-Null
Assert-LastExitCode 'primer backfill'
node scripts/db01c-backfill.mjs | Out-Null
Assert-LastExitCode 'segundo backfill'
$secondDeploy = (npx prisma migrate deploy --schema prisma/schema.prisma | Out-String)
Assert-LastExitCode 'segundo deploy'
$diff = (npx prisma migrate diff --from-url $target.Uri.AbsoluteUri --to-schema-datamodel prisma/schema.prisma --script | Out-String).Trim()
Assert-LastExitCode 'migrate diff'
$diff | Set-Content -Encoding utf8 'prisma/db01/DB-01K-ADOPTION-DIFF.sql'
$diffEmpty = $diff.Contains('This is an empty migration')
$diffExpectedOnlyLegacy = $diff -match '(?s)^-- DropTable\s+DROP TABLE "_prisma_migrations_legacy_db01c";\s*$'

$postQuery = @'
SELECT (SELECT count(*) FROM osi._prisma_migrations),
       (SELECT count(*) FROM public._prisma_migrations_legacy_db01c),
       (SELECT count(*) FROM osi._prisma_migrations_legacy_db01c),
       (SELECT count(*) FROM osi.osi_clients WHERE code='DB01K-CLIENT-001'),
       (SELECT count(*) FROM osi.osi_pipeline_cases WHERE "caseCode"='DB01K-CASE-001'),
       (SELECT count(*) FROM osi.tenant_memberships);
'@
$post = $postQuery | & $psql $plain.Uri.AbsoluteUri -At -F '|' -f -
Assert-LastExitCode 'lectura postadopción'

& $psql $admin.Uri.AbsoluteUri -v ON_ERROR_STOP=1 -c "DROP DATABASE $databaseName WITH (FORCE);" | Out-Null
Assert-LastExitCode 'drop para restauración'
& $psql $admin.Uri.AbsoluteUri -v ON_ERROR_STOP=1 -c "CREATE DATABASE $databaseName;" | Out-Null
Assert-LastExitCode 'create para restauración'
& $pgRestore --dbname=$plainUrl --no-owner --no-privileges --exit-on-error $backup | Out-Null
Assert-LastExitCode 'restauración de rollback'

$rollbackQuery = @'
SELECT (SELECT count(*) FROM public._prisma_migrations),
       (SELECT count(*) FROM osi._prisma_migrations),
       (to_regclass('osi._prisma_migrations_legacy_db01c') IS NULL),
       (to_regclass('osi.tenants') IS NULL),
       (SELECT count(*) FROM osi.osi_clients WHERE code='DB01K-CLIENT-001'),
       (SELECT count(*) FROM osi.osi_pipeline_cases WHERE "caseCode"='DB01K-CASE-001'),
       (SELECT count(*) FROM osi.osi_users);
'@
$rollback = $rollbackQuery | & $psql $plain.Uri.AbsoluteUri -At -F '|' -f -
Assert-LastExitCode 'validación de rollback'

$result = [ordered]@{
  productionUsed = $false
  database = $databaseName
  backupSha256 = $backupHash
  preAdoption = $pre
  postAdoption = $post
  secondDeployNoPending = $secondDeploy.Contains('No pending migrations to apply')
  diffEmpty = $diffEmpty
  diffExpectedOnlyLegacyHistory = $diffExpectedOnlyLegacy
  unexpectedDiff = -not ($diffEmpty -or $diffExpectedOnlyLegacy)
  rollbackRestore = $rollback
  syntheticOnly = $true
}
$result | ConvertTo-Json -Depth 5 | Set-Content -Encoding utf8 'prisma/db01/DB-01K-ADOPTION-RESULTS.json'
[IO.File]::Delete($backup)
$result | ConvertTo-Json -Depth 5
