import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { createMt01c2b2LocalPrisma } from "./mt-01c2b2-local-target.mjs";
import { applyMt01c2b2, MT01C2B2, planMt01c2b2, rollbackMt01c2b2 } from "./mt-01c2b2-lib.mjs";
import { readMt01c2b2Envelope, resolveMt01c2b2ManifestPath, writeMt01c2b2EnvelopeAtomic } from "./mt-01c2b2-manifest.mjs";

const { prisma, identity } = await createMt01c2b2LocalPrisma();
const run = `c2b2-${randomUUID().slice(0, 8)}`;
const manifestPath=resolveMt01c2b2ManifestPath(`.mt01c2b2-${run}.json`);
const results=[]; const created={tenants:[],users:[],memberships:[],clients:[],projects:[],cases:[]};
function check(name, condition, detail){results.push({name,passed:Boolean(condition),...(detail===undefined?{}:{detail})});if(!condition)throw new Error(name);}
async function rejects(fn,code){try{await fn();return false;}catch(error){return !code||error.code===code;}}
const clientData=(index)=>({id:`${run}-client-${index}`,code:`${run.toUpperCase()}-CLI-${index}`,name:`Cliente ${index}`,email:`client-${index}@example.test`,phone:'000',address:'Local',type:'corporate',status:'active',createdAt:'2026-08-10'});
const caseData=(index,ownerId)=>({id:`${run}-case-${index}`,caseCode:`${run.toUpperCase()}-CASE-${index}`,mode:'LOCAL',serviceType:'MOVING',customerType:'L3_CORPORATE',ownerId,ownerName:ownerId?'Owner sintético':'Sin asignar',originLocation:'A',destinationLocation:'B',milestonesJson:{marker:index}});

try{
  check('base sin raíces comerciales',await prisma.client.count()===0&&await prisma.project.count()===0&&await prisma.lead.count()===0&&await prisma.pipelineCase.count()===0);
  let tenant=await prisma.tenant.findUnique({where:{code:MT01C2B2.tenantCode}});
  if(!tenant){tenant=await prisma.tenant.create({data:{id:`${run}-tenant-target`,code:MT01C2B2.tenantCode,name:'International Packers SRL'}});created.tenants.push(tenant.id);}
  const other=await prisma.tenant.create({data:{id:`${run}-tenant-other`,code:`${run.toUpperCase()}-OTHER`,name:'Tenant B'}});created.tenants.push(other.id);
  const mappedUsers=[];
  for(let i=0;i<3;i++){
    const user=await prisma.user.create({data:{id:`${run}-user-${i}`,code:`${run.toUpperCase()}-U-${i}`,name:`Owner ${i}`,email:`${run}-${i}@example.test`,phone:'000',role:'A',status:'active',joinDate:'2026-08-10',passwordHash:'synthetic-no-login'}});created.users.push(user.id);mappedUsers.push(user.id);
    const membership=await prisma.tenantMembership.create({data:{id:`${run}-membership-${i}`,tenantId:tenant.id,userId:user.id,role:'A',status:'ACTIVE'}});created.memberships.push(membership.id);
  }
  const ambiguous=await prisma.user.create({data:{id:`${run}-user-ambiguous`,code:`${run.toUpperCase()}-U-AMB`,name:'Owner ambiguo',email:`${run}-amb@example.test`,phone:'000',role:'A',status:'active',joinDate:'2026-08-10',passwordHash:'synthetic-no-login'}});created.users.push(ambiguous.id);
  for(const [suffix,tenantId] of [['a',tenant.id],['b',other.id]]){const m=await prisma.tenantMembership.create({data:{id:`${run}-membership-amb-${suffix}`,tenantId,userId:ambiguous.id,role:'A',status:'ACTIVE'}});created.memberships.push(m.id);}
  const noMembership=await prisma.user.create({data:{id:`${run}-user-none`,code:`${run.toUpperCase()}-U-NONE`,name:'Owner sin membership',email:`${run}-none@example.test`,phone:'000',role:'A',status:'active',joinDate:'2026-08-10',passwordHash:'synthetic-no-login'}});created.users.push(noMembership.id);
  for(let i=0;i<7;i++){const row=await prisma.client.create({data:clientData(i)});created.clients.push(row.id);}
  for(let i=0;i<2;i++){const row=await prisma.project.create({data:{id:`${run}-project-${i}`,code:`${run.toUpperCase()}-PRJ-${i}`,name:`Proyecto ${i}`,clientId:created.clients[i],clientName:`Cliente ${i}`,status:'active',startDate:'2026-08-10',notes:`nota-${i}`}});created.projects.push(row.id);}
  for(let i=0;i<51;i++){
    const owner=i<39?mappedUsers[i%mappedUsers.length]:i<43?null:i<47?noMembership.id:ambiguous.id;
    const row=await prisma.pipelineCase.create({data:caseData(i,owner)});created.cases.push(row.id);
  }
  const auditBefore=await prisma.commercialAuditLog.count();
  const quotesBefore=await prisma.pipelineCaseQuote.count();
  const plan=await planMt01c2b2(prisma);
  check('dry-run READ ONLY',plan.readOnly&&plan.wroteRows===0);
  check('base totalmente LEGACY',plan.state==='LEGACY');
  check('conteos aprobados exactos',JSON.stringify(plan.summary).includes('"clients":7')&&plan.summary.pipelineCases===51);
  check('39 owners por membresía única',plan.summary.mappedOwners===39);
  check('12 casos quedan sin asignar',plan.summary.unassigned===12);
  check('sin inferencia automática',plan.summary.automaticInference===false);
  check('Lead permanece vacío',await prisma.lead.count()===0);
  const initialManifest=plan.manifest;
  const manifestText=JSON.stringify(initialManifest);
  check('manifest contiene sólo identificadores y hashes',!/email|phone|name|payload|token|secret|milestone/i.test(manifestText)&&initialManifest.clients.every(row=>/^[a-f0-9]{64}$/.test(row.beforeHash)&&/^[a-f0-9]{64}$/.test(row.expectedAfterHash)));
  check('manifest ausente se rechaza antes del backfill',await rejects(async()=>resolveMt01c2b2ManifestPath(''),'MT01C2B2_MANIFEST_PATH_REQUIRED'));
  check('ruta de manifest fuera del worktree se rechaza',await rejects(async()=>resolveMt01c2b2ManifestPath(`../.mt01c2b2-${run}.json`),'MT01C2B2_MANIFEST_PATH_UNSAFE'));
  writeMt01c2b2EnvelopeAtomic(manifestPath,{phase:'PENDING',createdAt:new Date().toISOString(),manifest:initialManifest},{exclusive:true});
  check('manifest se escribe atómicamente en ruta estable',existsSync(manifestPath)&&readMt01c2b2Envelope(manifestPath).manifest.manifestHash===initialManifest.manifestHash);
  const originalManifestFile=readFileSync(manifestPath,'utf8');
  writeFileSync(manifestPath,originalManifestFile.replace(created.clients[0],`${created.clients[0]}-altered`),'utf8');
  check('manifest alterado es rechazado',await rejects(async()=>readMt01c2b2Envelope(manifestPath),'MT01C2B2_MANIFEST_FILE_INVALID')||await rejects(async()=>readMt01c2b2Envelope(manifestPath),'MT01C2B2_MANIFEST_INVALID'));
  writeMt01c2b2EnvelopeAtomic(manifestPath,{phase:'PENDING',createdAt:new Date().toISOString(),manifest:initialManifest});

  await prisma.$executeRaw`UPDATE osi.osi_clients SET tenant_id=${tenant.id} WHERE id=${created.clients[0]}`;
  check('fila parcialmente tenantizada detiene lote',await rejects(()=>planMt01c2b2(prisma),'MT01C2B2_PARTIAL_STATE'));
  await prisma.$executeRaw`UPDATE osi.osi_clients SET tenant_id=NULL WHERE id=${created.clients[0]}`;
  await prisma.$executeRaw`UPDATE osi.osi_pipeline_cases SET tenant_id=${tenant.id},owner_membership_id=${created.memberships[1]},owner_user_id=${mappedUsers[1]} WHERE id=${created.cases[0]}`;
  check('tenant correcto con owner incorrecto detiene lote',await rejects(()=>planMt01c2b2(prisma),'MT01C2B2_PARTIAL_STATE'));
  await prisma.$executeRaw`UPDATE osi.osi_pipeline_cases SET tenant_id=NULL,owner_membership_id=NULL,owner_user_id=NULL WHERE id=${created.cases[0]}`;
  await prisma.$executeRaw`UPDATE osi.osi_clients SET tenant_id=${other.id} WHERE id=${created.clients[0]}`;
  check('tenant incorrecto detiene lote',await rejects(()=>planMt01c2b2(prisma),'MT01C2B2_PARTIAL_STATE'));
  await prisma.$executeRaw`UPDATE osi.osi_clients SET tenant_id=NULL WHERE id=${created.clients[0]}`;
  const extraMembership=await prisma.tenantMembership.create({data:{id:`${run}-membership-extra`,tenantId:other.id,userId:mappedUsers[0],role:'A',status:'ACTIVE'}});created.memberships.push(extraMembership.id);
  check('owner ambiguo detiene lote',await rejects(()=>planMt01c2b2(prisma),'MT01C2B2_OWNER_COUNT'));
  await prisma.tenantMembership.delete({where:{id:extraMembership.id}});
  await prisma.tenantMembership.update({where:{id:created.memberships[0]},data:{status:'SUSPENDED'}});
  check('membership suspendida detiene lote',await rejects(()=>planMt01c2b2(prisma),'MT01C2B2_OWNER_COUNT'));
  await prisma.tenantMembership.update({where:{id:created.memberships[0]},data:{status:'ACTIVE'}});

  check('fallo antes del commit revierte todo',await rejects(()=>applyMt01c2b2(prisma,initialManifest,{failAt:'AFTER_CLIENT_UPDATE'}),'MT01C2B2_SYNTHETIC_FAILURE'));
  check('cero estado parcial tras fallo temprano',await prisma.client.count({where:{tenantId:{not:null}}})===0&&await prisma.project.count({where:{tenantId:{not:null}}})===0);
  let finalValidationError;
  try { await applyMt01c2b2(prisma,initialManifest,{failAt:'DURING_FINAL_VALIDATION'}); }
  catch (error) { finalValidationError = error; }
  check('fallo durante validación final revierte todo',finalValidationError?.code==='MT01C2B2_SYNTHETIC_FAILURE',{code:finalValidationError?.code||null,message:finalValidationError?.message||null});
  check('cero estado parcial tras validación fallida',await prisma.pipelineCase.count({where:{OR:[{tenantId:{not:null}},{ownerMembershipId:{not:null}},{ownerUserId:{not:null}}]}})===0);

  const concurrent=await Promise.all(Array.from({length:20},()=>applyMt01c2b2(prisma,initialManifest)));
  check('20 ejecuciones completan sin duplicar',concurrent.length===20);
  check('un solo backfill realiza cambios',concurrent.filter(row=>row.changed.clients===7&&row.changed.projects===2&&row.changed.pipelineCases===51&&row.changed.owners===39).length===1);
  check('las otras ejecuciones son idempotentes',concurrent.filter(row=>Object.values(row.changed).every(value=>value===0)).length===19);
  check('manifest estable bajo concurrencia',concurrent.every(row=>row.manifest.manifestHash===initialManifest.manifestHash));
  check('7 Client tenantizados',await prisma.client.count({where:{tenantId:tenant.id}})===7);
  check('2 Project tenantizados',await prisma.project.count({where:{tenantId:tenant.id}})===2);
  check('51 PipelineCase tenantizados',await prisma.pipelineCase.count({where:{tenantId:tenant.id}})===51);
  check('39 owners relacionales',await prisma.pipelineCase.count({where:{tenantId:tenant.id,ownerMembershipId:{not:null},ownerUserId:{not:null}}})===39);
  check('cola sin asignar contiene 12',await prisma.pipelineCase.count({where:{tenantId:tenant.id,ownerMembershipId:null,ownerUserId:null}})===12);
  check('ownerId heredado preservado',await prisma.pipelineCase.count({where:{id:{in:created.cases.slice(0,39)},ownerId:null}})===0);
  check('milestones preservados',(await prisma.pipelineCase.findMany({where:{id:{in:created.cases}},select:{milestonesJson:true}})).every(row=>row.milestonesJson?.marker!==undefined));
  check('auditoría ajena intacta',await prisma.commercialAuditLog.count()===auditBefore);
  const appliedPlan=await planMt01c2b2(prisma);
  check('base completamente backfilled reconocida',appliedPlan.state==='APPLIED');
  const second=await applyMt01c2b2(prisma,initialManifest);
  check('segunda ejecución crea cero cambios',Object.values(second.changed).every(value=>value===0));
  check('respuesta perdida después de commit permite reintento',second.initialState==='APPLIED');
  const originalClient=await prisma.client.findUnique({where:{id:created.clients[0]},select:{name:true,updatedAt:true}});
  await prisma.$executeRaw`UPDATE osi.osi_clients SET name=${`${originalClient.name}-modificado`} WHERE id=${created.clients[0]}`;
  check('rollback rechaza fila modificada',await rejects(()=>rollbackMt01c2b2(prisma,initialManifest),'MT01C2B2_MANIFEST_CHANGED'));
  check('rechazo de rollback no altera lote',await prisma.client.count({where:{tenantId:tenant.id}})===7&&await prisma.pipelineCase.count({where:{tenantId:tenant.id}})===51);
  await prisma.$executeRaw`UPDATE osi.osi_clients SET name=${originalClient.name},"updatedAt"=${originalClient.updatedAt} WHERE id=${created.clients[0]}`;
  const restoredPlan=await planMt01c2b2(prisma);
  check('fingerprint comercial se restaura exactamente',restoredPlan.manifest.manifestHash===initialManifest.manifestHash);
  const rollback=await rollbackMt01c2b2(prisma,restoredPlan.manifest);
  check('rollback exacto',rollback.rolledBack.clients===7&&rollback.rolledBack.projects===2&&rollback.rolledBack.pipelineCases===51);
  check('rollback deja campos empresariales NULL',(await prisma.client.count({where:{tenantId:{not:null}}}))===0&&(await prisma.project.count({where:{tenantId:{not:null}}}))===0&&(await prisma.pipelineCase.count({where:{OR:[{tenantId:{not:null}},{ownerMembershipId:{not:null}},{ownerUserId:{not:null}}]}}))===0);
  const secondRollback=await rollbackMt01c2b2(prisma,restoredPlan.manifest);
  check('segundo rollback es idempotente',Object.values(secondRollback.rolledBack).every(value=>value===0)&&secondRollback.initialState==='LEGACY');
  const reapplied=await applyMt01c2b2(prisma,restoredPlan.manifest);
  check('reaplicación completa',reapplied.changed.clients===7&&reapplied.changed.projects===2&&reapplied.changed.pipelineCases===51&&reapplied.changed.owners===39);
  await rollbackMt01c2b2(prisma,reapplied.manifest);
  const foreignClient=created.clients[0]; await prisma.$executeRaw`UPDATE osi.osi_clients SET tenant_id=${other.id} WHERE id=${foreignClient}`;
  check('tenant conflictivo detiene lote',await rejects(()=>planMt01c2b2(prisma),'MT01C2B2_PARTIAL_STATE'));
  await prisma.$executeRaw`UPDATE osi.osi_clients SET tenant_id=NULL WHERE id=${foreignClient}`;
  const lead=await prisma.lead.create({data:{id:`${run}-lead`,code:`${run.toUpperCase()}-LEAD`,status:'new',clientName:'Sintético'}});
  check('Lead no vacío detiene lote',await rejects(()=>planMt01c2b2(prisma),'MT01C2B2_LEAD_NOT_EMPTY'));
  await prisma.lead.delete({where:{id:lead.id}});
  check('otras tablas permanecen intactas',await prisma.commercialAuditLog.count()===auditBefore&&await prisma.pipelineCaseQuote.count()===quotesBefore);
  process.stdout.write(`${JSON.stringify({ok:true,assertions:results.length,target:identity,batchId:MT01C2B2.batchId,manifestHash:initialManifest.manifestHash,results},null,2)}\n`);
}catch(error){process.stdout.write(`${JSON.stringify({ok:false,assertions:results.filter(r=>r.passed).length,error:{name:error.name,code:error.code,message:error.message},results},null,2)}\n`);process.exitCode=1;}
finally{
  if(existsSync(manifestPath))unlinkSync(manifestPath);
  await prisma.pipelineCase.deleteMany({where:{id:{in:created.cases}}}).catch(()=>{});
  await prisma.project.deleteMany({where:{id:{in:created.projects}}}).catch(()=>{});
  await prisma.client.deleteMany({where:{id:{in:created.clients}}}).catch(()=>{});
  await prisma.tenantMembership.deleteMany({where:{id:{in:created.memberships}}}).catch(()=>{});
  await prisma.user.deleteMany({where:{id:{in:created.users}}}).catch(()=>{});
  await prisma.tenant.deleteMany({where:{id:{in:created.tenants}}}).catch(()=>{});
  await prisma.$disconnect();
}
