const SPREADSHEET_ID='1TPMJl1eyKn1gOog8ATxjOQfo5povi2dYkmekt2qVQ4E';
const BILL_FOLDER_ID='';
const POINTS_PER=999;
const REWARD_POINTS=5;

function doGet(){return out({ok:true,service:'Praksh Collection Rewards'})}
function doPost(e){try{const b=JSON.parse((e&&e.postData&&e.postData.contents)||'{}');switch(b.action){case'customerGet':return out(customerGet(b));case'submitBill':return out(submitBill(b));case'ownerLogin':return out(ownerLogin(b));case'ownerData':return out(ownerData(b));case'approveBill':return out(changeBill(b,'Approved',''));case'rejectBill':return out(changeBill(b,'Rejected',b.reason||'Rejected by owner'));case'redeem':return out(redeem(b));default:return out({ok:false,error:'Unknown action'})}}catch(err){return out({ok:false,error:err.message})}}
function out(x){return ContentService.createTextOutput(JSON.stringify(x)).setMimeType(ContentService.MimeType.JSON)}
function sheet(n){const s=SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(n);if(!s)throw Error(n+' sheet not found.');return s}
function data(n){const s=sheet(n),v=s.getDataRange().getValues();return{s,h:v.length?v[0].map(String):[],v:v.slice(1)}}
function col(h,names,required=true){for(const n of names){const i=h.findIndex(x=>String(x).trim().toLowerCase()===String(n).trim().toLowerCase());if(i>=0)return i}if(required)throw Error('Missing column: '+names.join(' / '));return -1}
function val(row,h,names,def=''){const i=col(h,names,false);return i<0?def:row[i]}
function cleanPhone(v){return String(v||'').replace(/\D/g,'')}
function formatDate(v){if(Object.prototype.toString.call(v)==='[object Date]')return Utilities.formatDate(v,Session.getScriptTimeZone(),'yyyy-MM-dd');return String(v||'')}

function customerGet(b){
  const c=data('Customers'), pi=col(c.h,['Phone','WhatsApp Number','Mobile']), ni=col(c.h,['Name','Customer Name']), idc=col(c.h,['Customer ID','ID']);
  let row=c.v.find(r=>cleanPhone(r[pi])===cleanPhone(b.phone));
  if(!row){if(!b.name)throw Error('Customer not found. Enter your name to register.');const id=Utilities.getUuid();const newRow=Array(c.h.length).fill('');newRow[idc]=id;newRow[ni]=b.name;newRow[pi]=cleanPhone(b.phone);setIf(c.h,newRow,['Total Bills','Total Purchases'],0);setIf(c.h,newRow,['Earned','Total Points'],0);setIf(c.h,newRow,['Redeemed'],0);setIf(c.h,newRow,['Available'],0);c.s.appendRow(newRow);return customerGet({phone:b.phone,name:b.name})}
  const id=row[idc],bb=data('Bills'),cid=col(bb.h,['Customer ID']),status=col(bb.h,['Status']),points=col(bb.h,['Points','Points Earned']);
  const bs=bb.v.filter(r=>String(r[cid])===String(id));let earned=0,pending=0;
  bs.forEach(r=>{if(String(r[status]).trim().toLowerCase()==='approved')earned+=Number(r[points]||0);if(String(r[status]).trim().toLowerCase()==='pending')pending++});
  const redeemed=Number(val(row,c.h,['Redeemed'],0)||0),available=Math.max(0,earned-redeemed);
  return{ok:true,customer:{id,name:row[ni],phone:row[pi],earned,redeemed,available,pending,bills:bs.map(r=>({id:val(r,bb.h,['Bill ID','Submission ID','ID']),date:formatDate(val(r,bb.h,['Purchase Date'])),bill:val(r,bb.h,['Bill Number']),amount:val(r,bb.h,['Bill Amount']),points:val(r,bb.h,['Points','Points Earned'],0),status:val(r,bb.h,['Status']),reason:val(r,bb.h,['Reason','Notes'])}))}}}

function submitBill(b){
  if(!b.customerId)throw Error('Please open your customer rewards first.');
  if(Number(b.billAmount)<POINTS_PER)throw Error('Minimum qualifying bill is ₹'+POINTS_PER+'.');
  const x=data('Bills'),bi=col(x.h,['Bill Number']);
  if(x.v.some(r=>String(r[bi]).trim().toLowerCase()===String(b.billNumber).trim().toLowerCase()))throw Error('Duplicate bill number.');
  let photo='';
  if(b.billPhoto){const m=String(b.billPhoto).match(/^data:(.*?);base64,(.*)$/);if(m){const blob=Utilities.newBlob(Utilities.base64Decode(m[2]),m[1],'bill_'+b.billNumber+'.jpg');const file=BILL_FOLDER_ID?DriveApp.getFolderById(BILL_FOLDER_ID).createFile(blob):DriveApp.createFile(blob);photo=file.getUrl()}}
  const row=Array(x.h.length).fill('');
  put(x.h,row,['Bill ID','Submission ID','ID'],Utilities.getUuid());put(x.h,row,['Customer ID'],b.customerId);put(x.h,row,['Customer Name','Name'],b.name||'');put(x.h,row,['Phone','WhatsApp Number','Mobile'],cleanPhone(b.phone));put(x.h,row,['Bill Number'],b.billNumber);put(x.h,row,['Bill Amount'],Number(b.billAmount));put(x.h,row,['Bill Photo URL','Bill Photo'],photo);put(x.h,row,['Purchase Date'],b.purchaseDate||'');put(x.h,row,['Points','Points Earned'],0);put(x.h,row,['Status'],'Pending');put(x.h,row,['Processed'],'');put(x.h,row,['Reason','Notes'],'');put(x.h,row,['Submitted At','Timestamp'],new Date());x.s.appendRow(row);
  syncCustomer(b.customerId);
  return{ok:true,message:'Bill submitted for owner approval.'}
}

function ownerLogin(b){const p=PropertiesService.getScriptProperties(),u=p.getProperty('OWNER_USERNAME')||'owner',pw=p.getProperty('OWNER_PASSWORD')||'ChangeMe123!';if(String(b.username)!==String(u)||String(b.password)!==String(pw))throw Error('Invalid owner credentials.');const t=Utilities.getUuid()+'-'+Utilities.getUuid();p.setProperty('SESSION_'+t,String(Date.now()));return{ok:true,token:t}}
function auth(t){if(!t)throw Error('Owner login required.');const p=PropertiesService.getScriptProperties(),v=p.getProperty('SESSION_'+t);if(!v)throw Error('Owner session expired. Please login again.');if(Date.now()-Number(v)>8*60*60*1000){p.deleteProperty('SESSION_'+t);throw Error('Owner session expired. Please login again.')}}

function ownerData(b){
  auth(b.token);
  const c=data('Customers'),bb=data('Bills'),st=col(bb.h,['Status']);
  const pending=bb.v.filter(r=>String(r[st]).trim().toLowerCase()==='pending').map(r=>({id:val(r,bb.h,['Bill ID','Submission ID','ID']),name:val(r,bb.h,['Customer Name','Name']),phone:val(r,bb.h,['Phone','WhatsApp Number','Mobile']),bill:val(r,bb.h,['Bill Number']),amount:val(r,bb.h,['Bill Amount']),date:formatDate(val(r,bb.h,['Purchase Date'])),photo:val(r,bb.h,['Bill Photo URL','Bill Photo']),submitted:formatDate(val(r,bb.h,['Submitted At','Timestamp']))}));
  const customers=c.v.map(r=>{const id=val(r,c.h,['Customer ID','ID']),mine=bb.v.filter(z=>String(val(z,bb.h,['Customer ID']))===String(id)),earned=mine.filter(z=>String(val(z,bb.h,['Status'])).trim().toLowerCase()==='approved').reduce((a,z)=>a+Number(val(z,bb.h,['Points','Points Earned'],0)||0),0),redeemed=Number(val(r,c.h,['Redeemed'],0)||0);return{name:val(r,c.h,['Name','Customer Name']),phone:val(r,c.h,['Phone','WhatsApp Number','Mobile']),bills:mine.length,earned,redeemed,available:Math.max(0,earned-redeemed)}});
  return{ok:true,stats:{customers:customers.length,pendingBills:pending.length,issued:customers.reduce((a,c)=>a+c.earned,0),redeemed:customers.reduce((a,c)=>a+c.redeemed,0)},pending,customers}
}

function changeBill(b,status,reason){
  auth(b.token);const x=data('Bills'),id=col(x.h,['Bill ID','Submission ID','ID']),st=col(x.h,['Status']),pts=col(x.h,['Points','Points Earned']),rs=col(x.h,['Reason','Notes'],false),proc=col(x.h,['Processed'],false),i=x.v.findIndex(r=>String(r[id])===String(b.billId));
  if(i<0)throw Error('Bill not found.');if(String(x.v[i][st]).trim().toLowerCase()!=='pending')throw Error('This bill has already been processed.');const row=i+2;
  x.s.getRange(row,st+1).setValue(status);if(rs>=0)x.s.getRange(row,rs+1).setValue(reason);if(proc>=0)x.s.getRange(row,proc+1).setValue(new Date());
  let points=0;if(status==='Approved'){const amount=Number(val(x.v[i],x.h,['Bill Amount'],0)||0);points=Math.floor(amount/POINTS_PER)}x.s.getRange(row,pts+1).setValue(points);
  syncCustomer(val(x.v[i],x.h,['Customer ID']));
  return{ok:true,points}
}

function redeem(b){const c=customerGet(b).customer;if(c.available<REWARD_POINTS)throw Error('You need '+REWARD_POINTS+' approved points.');const r=data('Rewards'),cr=data('Customers'),id=col(cr.h,['Customer ID','ID']),i=cr.v.findIndex(x=>String(x[id])===String(c.id));if(i<0)throw Error('Customer not found.');const rr=Array(r.h.length).fill('');put(r.h,rr,['Request ID','Reward ID','ID'],Utilities.getUuid());put(r.h,rr,['Customer ID'],c.id);put(r.h,rr,['Customer Name','Name'],c.name);put(r.h,rr,['Phone','WhatsApp Number','Mobile'],c.phone);put(r.h,rr,['Points','Points Redeemed'],REWARD_POINTS);put(r.h,rr,['Reward','Reward Name'],'₹200 Reward');put(r.h,rr,['Status'],'Pending');put(r.h,rr,['Date','Redemption Date'],new Date());put(r.h,rr,['Reason','Notes'],'');r.s.appendRow(rr);const red=col(cr.h,['Redeemed'],false);if(red>=0)cr.s.getRange(i+2,red+1).setValue(Number(val(cr.v[i],cr.h,['Redeemed'],0)||0)+REWARD_POINTS);return{ok:true,message:'Reward request submitted.'}}

function syncCustomer(customerId){if(!customerId)return;const c=data('Customers'),id=col(c.h,['Customer ID','ID']),i=c.v.findIndex(r=>String(r[id])===String(customerId));if(i<0)return;const bb=data('Bills'),cid=col(bb.h,['Customer ID']),st=col(bb.h,['Status']),pts=col(bb.h,['Points','Points Earned']),mine=bb.v.filter(r=>String(r[cid])===String(customerId));const earned=mine.filter(r=>String(r[st]).trim().toLowerCase()==='approved').reduce((a,r)=>a+Number(r[pts]||0),0),red=Number(val(c.v[i],c.h,['Redeemed'],0)||0),totalBills=mine.length;setCell(c.s,i+2,c.h,['Total Bills','Total Purchases'],totalBills);setCell(c.s,i+2,c.h,['Earned','Total Points'],earned);setCell(c.s,i+2,c.h,['Available'],Math.max(0,earned-red))}
function put(h,row,names,value){const i=col(h,names,false);if(i>=0)row[i]=value}
function setIf(h,row,names,value){put(h,row,names,value)}
function setCell(s,row,h,names,value){const i=col(h,names,false);if(i>=0)s.getRange(row,i+1).setValue(value)}
function setup(){const ss=SpreadsheetApp.openById(SPREADSHEET_ID);ensure(ss,'Customers',['Customer ID','Customer Name','WhatsApp Number','Join Date','Total Points','Total Purchases','Reward Count','Status','Redeemed','Available']);ensure(ss,'Bills',['Submission ID','Customer ID','Customer Name','WhatsApp Number','Bill Number','Bill Amount','Bill Photo URL','Purchase Date','Points Earned','Status','Duplicate Check','Notes','Submitted At']);ensure(ss,'Rewards',['Reward ID','Customer ID','Customer Name','WhatsApp Number','Reward Name','Points Required','Points Redeemed','Status','Redemption Date','Notes']);PropertiesService.getScriptProperties().setProperties({OWNER_USERNAME:'owner',OWNER_PASSWORD:'ChangeMe123!'})}
function ensure(ss,n,h){let s=ss.getSheetByName(n);if(!s)s=ss.insertSheet(n);if(s.getLastRow()===0)s.appendRow(h)}
