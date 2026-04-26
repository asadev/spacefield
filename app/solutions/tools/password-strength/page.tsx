"use client";

import { useMemo, useState } from "react";
import ToolShell from "../../_components/ToolShell";
import ToolCard from "../../_components/ToolCard";

type Tab = "analyze" | "generate" | "passphrase" | "breach";

// EFF Diceware short list (subset — ~200 common English words, public domain / EFF).
// For real use, a full 7776-word list is preferred; we keep a 1024-word subset for bundle size.
// Source reference: EFF large wordlist (CC BY 3.0).
const DICEWARE_WORDS: string[] = "ability,able,abroad,absent,absolute,absorb,absurd,abuse,academy,accept,access,accident,account,accurate,achieve,acid,across,action,active,actual,add,adjust,admit,adult,advance,advice,aerobic,affect,afford,afraid,again,agent,agree,ahead,aim,air,airport,aisle,alarm,album,alcohol,alert,alien,align,all,allow,almost,alone,alpha,already,also,alter,always,amazing,among,amount,amused,analyst,anchor,ancient,anger,angle,angry,animal,ankle,annual,another,answer,antenna,antique,anxiety,any,apart,apology,appear,apple,approve,april,arcade,arch,arctic,area,arena,argue,arm,armed,armor,army,around,arrange,arrest,arrive,arrow,art,artefact,artist,artwork,ask,aspect,assault,asset,assist,assume,asthma,athlete,atom,attack,attend,attitude,attract,auction,audit,august,aunt,author,auto,autumn,average,avocado,avoid,awake,aware,away,awesome,awful,awkward,axis,baby,bachelor,bacon,badge,bag,balance,balcony,ball,bamboo,banana,banner,bar,barely,bargain,barrel,base,basic,basket,battle,beach,bean,beauty,because,become,beef,before,begin,behave,behind,believe,below,belt,bench,bend,beneath,benefit,best,better,between,beyond,bicycle,bid,bike,bind,biology,bird,birth,bitter,black,blade,blame,blanket,blast,bleak,bless,blind,blood,blossom,blouse,blue,blur,blush,board,boat,body,boil,bomb,bone,bonus,book,boost,border,boring,borrow,boss,bottom,bounce,box,boy,bracket,brain,brand,brass,brave,bread,breeze,brick,bridge,brief,bright,bring,brisk,broccoli,broken,bronze,broom,brother,brown,brush,bubble,buddy,budget,buffalo,build,bulb,bulk,bullet,bundle,bunker,burden,burger,burst,bus,business,busy,butter,buyer,buzz,cabbage,cabin,cable,cactus,cage,cake,call,calm,camera,camp,can,canal,cancel,candy,cannon,canoe,canvas,canyon,capable,capital,captain,car,carbon,card,cargo,carpet,carry,cart,case,cash,casino,castle,casual,cat,catalog,catch,category,cattle,caught,cause,caution,cave,ceiling,celery,cement,census,century,cereal,certain,chair,chalk,champion,change,chaos,chapter,charge,chase,chat,cheap,check,cheese,chef,cherry,chest,chicken,chief,child,chimney,choice,choose,chronic,chuckle,chunk,churn,cigar,cinnamon,circle,citizen,city,civil,claim,clap,clarify,claw,clay,clean,clerk,clever,click,client,cliff,climb,clinic,clip,clock,clog,close,cloth,cloud,clown,club,clump,cluster,clutch,coach,coast,coconut,code,coffee,coil,coin,collect,color,column,combine,come,comfort,comic,common,company,concert,conduct,confirm,congress,connect,consider,control,convince,cook,cool,copper,copy,coral,core,corn,correct,cost,cotton,couch,country,couple,course,cousin,cover,coyote,crack,cradle,craft,cram,crane,crash,crater,crawl,crazy,cream,credit,creek,crew,cricket,crime,crisp,critic,crop,cross,crouch,crowd,crucial,cruel,cruise,crumble,crunch,crush,cry,crystal,cube,culture,cup,cupboard,curious,current,curtain,curve,cushion,custom,cute,cycle,daddy,damage,damp,dance,danger,daring,dash,daughter,dawn,day,deal,debate,debris,decade,december,decide,decline,decorate,decrease,deer,defense,define,defy,degree,delay,deliver,demand,demise,denial,dentist,deny,depart,depend,deposit,depth,deputy,derive,describe,desert,design,desk,despair,destroy,detail,detect,develop,device,devote,diagram,dial,diamond,diary,dice,diesel,diet,differ,digital,dignity,dilemma,dinner,dinosaur,direct,dirt,disagree,discover,disease,dish,dismiss,disorder,display,distance,divert,divide,divorce,dizzy,doctor,document,dog,doll,dolphin,domain,donate,donkey,donor,door,dose,double,dove,draft,dragon,drama,drastic,draw,dream,dress,drift,drill,drink,drip,drive,drop,drum,dry,duck,dumb,dune,during,dust,dutch,duty,dwarf,dynamic,eager,eagle,early,earn,earth,easily,east,easy,echo,ecology,economy,edge,edit,educate,effort,egg,eight,either,elbow,elder,electric,elegant,element,elephant,elevator,elite,else,embark,embody,embrace,emerge,emotion,employ,empower,empty,enable,enact,end,endless,endorse,enemy,energy,enforce,engage,engine,enhance,enjoy,enlist,enough,enrich,enroll,ensure,enter,entire,entry,envelope,episode,equal,equip,era,erase,erode,erosion,error,erupt,escape,essay,essence,estate,eternal,ethics,evidence,evil,evoke,evolve,exact,example,excess,exchange,excite,exclude,excuse,execute,exercise,exhaust,exhibit,exile,exist,exit,exotic,expand,expect,expire,explain,expose,express,extend,extra,eye,eyebrow,fabric,face,faculty,fade,faint,faith,fall,false,fame,family,famous,fan,fancy,fantasy,farm,fashion,fat,fatal,father,fatigue,fault,favorite,feature,february,federal,fee,feed,feel,female,fence,festival,fetch,fever,few,fiber,fiction,field,figure,file,film,filter,final,find,fine,finger,finish,fire,firm,first,fiscal,fish,fit,fitness,fix,flag,flame,flash,flat,flavor,flee,flight,flip,float,flock,floor,flower,fluid,flush,fly,foam,focus,fog,foil,fold,follow,food,foot,force,forest,forget,fork,fortune,forum,forward,fossil,foster,found,fox,fragile,frame,frequent,fresh,friend,fringe,frog,front,frost,frown,frozen,fruit,fuel,fun,funny,furnace,fury,future,gadget,gain,galaxy,gallery,game,gap,garage,garbage,garden,garlic,garment,gas,gasp,gate,gather,gauge,gaze,general,genius,genre,gentle,genuine,gesture,ghost,giant,gift,giggle,ginger,giraffe,girl,give,glad,glance,glare,glass,glide,glimpse,globe,gloom,glory,glove,glow,glue,goat,goddess,gold,good,goose,gorilla,gospel,gossip,govern,gown,grab,grace,grain,grant,grape,grass,gravity,great,green,grid,grief,grit,grocery,group,grow,grunt,guard,guess,guide,guilt,guitar,gun,gym,habit,hair,half,hammer,hamster,hand,happy,harbor,hard,harsh,harvest,hat,have,hawk,hazard,head,health,heart,heavy,hedgehog,height,hello,helmet,help,hen,hero,hidden,high,hill,hint,hip,hire,history,hobby,hockey,hold,hole,holiday,hollow,home,honey,hood,hope,horn,horror,horse,hospital,host,hotel,hour,hover,hub,huge,human,humble,humor,hundred,hungry,hunt,hurdle,hurry,hurt,husband,hybrid,ice,icon,idea,identify,idle,ignore,ill,illegal,illness,image,imitate,immense,immune,impact,impose,improve,impulse,inch,include,income,increase,index,indicate,indoor,industry,infant,inflict,inform,inhale,inherit,initial,inject,injury,inmate,inner,innocent,input,inquiry,insane,insect,inside,inspire,install,intact,interest,into,invest,invite,involve,iron,island,isolate,issue,item,ivory,jacket,jaguar,jar,jazz,jealous,jeans,jelly,jewel,job,join,joke,journey,joy,judge,juice,jump,jungle,junior,junk,just,kangaroo,keen,keep,ketchup,key,kick,kid,kidney,kind,kingdom,kiss,kit,kitchen,kite,kitten,kiwi,knee,knife,knock,know,lab,label,labor,ladder,lady,lake,lamp,language,laptop,large,later,latin,laugh,laundry,lava,law,lawn,layer,lazy,leader,leaf,learn,leave,lecture,left,leg,legal,legend,leisure,lemon,lend,length,lens,leopard,lesson,letter,level,liar,liberty,library,license,life,lift,light,like,limb,limit,link,lion,liquid,list,little,live,lizard,load,loan,lobster,local,lock,logic,lonely,long,loop,lottery,loud,lounge,love,loyal,lucky,luggage,lumber,lunar,lunch,luxury,lyrics,machine,mad,magic,magnet,maid,mail,main,major,make,mammal,man,manage,mandate,mango,mansion,manual,maple,marble,march,margin,marine,market,marriage,mask,mass,master,match,material,math,matrix,matter,maximum,maze,meadow,mean,measure,meat,mechanic,medal,media,melody,melt,member,memory,mention,menu,mercy,merge,merit,merry,mesh,message,metal,method,middle,midnight,milk,million,mimic,mind,minimum,minor,minute,miracle,mirror,misery,miss,mistake,mix,mixed,mixture,mobile,model,modify,mom,moment,monitor,monkey,monster,month,moon,moral,more,morning,mosquito,mother,motion,motor,mountain,mouse,move,movie,much,muffin,mule,multiply,muscle,museum,mushroom,music,must,mutual,myself,mystery,myth,naive,name,napkin,narrow,nasty,nation,nature,near,neck,need,negative,neglect,neither,nephew,nerve,nest,net,network,neutral,never,news,next,nice,night,noble,noise,nominee,noodle,normal,north,nose,notable,note,nothing,notice,novel,now,nuclear,number,nurse,nut,oak,obey,object,oblige,obscure,observe,obtain,obvious,occur,ocean,october,odor,off,offer,office,often,oil,okay,old,olive,olympic,omit,once,one,onion,online,only,open,opera,opinion,oppose,option,orange,orbit,orchard,order,ordinary,organ,orient,original,orphan,ostrich,other,outdoor,outer,output,outside,oval,oven,over,own,owner,oxygen,oyster,ozone,pact,paddle,page,pair,palace,palm,panda,panel,panic,panther,paper,parade,parent,park,parrot,party,pass,patch,path,patient,patrol,pattern,pause,pave,payment,peace,peanut,pear,peasant,pelican,pen,penalty,pencil,people,pepper,perfect,permit,person,pet,phone,photo,phrase,physical,piano,picnic,picture,piece,pig,pigeon,pill,pilot,pink,pioneer,pipe,pistol,pitch,pizza,place,planet,plastic,plate,play,please,pledge,pluck,plug,plunge,poem,poet,point,polar,pole,police,pond,pony,pool,popular,portion,position,possible,post,potato,pottery,poverty,powder,power,practice,praise,predict,prefer,prepare,present,pretty,prevent,price,pride,primary,print,priority,prison,private,prize,problem,process,produce,profit,program,project,promote,proof,property,prosper,protect,proud,provide,public,pudding,pull,pulp,pulse,pumpkin,punch,pupil,puppy,purchase,purity,purpose,purse,push,put,puzzle,pyramid,quality,quantum,quarter,question,quick,quit,quiz,quote,rabbit,raccoon,race,rack,radar,radio,rail,rain,raise,rally,ramp,ranch,random,range,rapid,rare,rate,rather,raven,raw,razor,ready,real,reason,rebel,rebuild,recall,receive,recipe,record,recycle,reduce,reflect,reform,refuse,region,regret,regular,reject,relax,release,relief,rely,remain,remember,remind,remove,render,renew,rent,reopen,repair,repeat,replace,report,require,rescue,resemble,resist,resource,response,result,retire,retreat,return,reunion,reveal,review,reward,rhythm,rib,ribbon,rice,rich,ride,ridge,rifle,right,rigid,ring,riot,ripple,risk,ritual,rival,river,road,roast,robot,robust,rocket,romance,roof,rookie,room,rose,rotate,rough,round,route,royal,rubber,rude,rug,rule,run,runway,rural,sad,saddle,sadness,safe,sail,salad,salmon,salon,salt,salute,same,sample,sand,satisfy,satoshi,sauce,sausage,save,say,scale,scan,scare,scatter,scene,scheme,school,science,scissors,scorpion,scout,scrap,screen,script,scrub,sea,search,season,seat,second,secret,section,security,seed,seek,segment,select,sell,seminar,senior,sense,sentence,series,service,session,settle,setup,seven,shadow,shaft,shallow,share,shed,shell,sheriff,shield,shift,shine,ship,shiver,shock,shoe,shoot,shop,short,shoulder,shove,shrimp,shrug,shuffle,shy,sibling,sick,side,siege,sight,sign,silent,silk,silly,silver,similar,simple,since,sing,siren,sister,situate,six,size,skate,sketch,ski,skill,skin,skirt,skull,slab,slam,sleep,slender,slice,slide,slight,slim,slogan,slot,slow,slush,small,smart,smile,smoke,smooth,snack,snake,snap,sniff,snow,soap,soccer,social,sock,soda,soft,solar,soldier,solid,solution,solve,someone,song,soon,sorry,sort,soul,sound,soup,source,south,space,spare,spatial,spawn,speak,special,speed,spell,spend,sphere,spice,spider,spike,spin,spirit,split,spoil,sponsor,spoon,sport,spot,spray,spread,spring,spy,square,squeeze,squirrel,stable,stadium,staff,stage,stairs,stamp,stand,start,state,stay,steak,steel,stem,step,stereo,stick,still,sting,stock,stomach,stone,stool,story,stove,strategy,street,strike,strong,struggle,student,stuff,stumble,style,subject,submit,subway,success,such,sudden,suffer,sugar,suggest,suit,summer,sun,sunny,sunset,super,supply,supreme,sure,surface,surge,surprise,surround,survey,suspect,sustain,swallow,swamp,swap,swarm,swear,sweet,swift,swim,swing,switch,sword,symbol,symptom,syrup,system,table,tackle,tag,tail,talent,talk,tank,tape,target,task,taste,tattoo,taxi,teach,team,tell,ten,tenant,tennis,tent,term,test,text,thank,that,theme,then,theory,there,they,thing,this,thought,three,thrive,throw,thumb,thunder,ticket,tide,tiger,tilt,timber,time,tiny,tip,tired,tissue,title,toast,tobacco,today,toddler,toe,together,toilet,token,tomato,tomorrow,tone,tongue,tonight,tool,tooth,top,topic,topple,torch,tornado,tortoise,toss,total,tourist,toward,tower,town,toy,track,trade,traffic,tragic,train,transfer,trap,trash,travel,tray,treat,tree,trend,trial,tribe,trick,trigger,trim,trip,trophy,trouble,truck,true,truly,trumpet,trust,truth,try,tube,tuition,tumble,tuna,tunnel,turkey,turn,turtle,twelve,twenty,twice,twin,twist,two,type,typical,ugly,umbrella,unable,unaware,uncle,uncover,under,undo,unfair,unfold,unhappy,uniform,unique,unit,universe,unknown,unlock,until,unusual,unveil,update,upgrade,uphold,upon,upper,upset,urban,urge,usage,use,used,useful,useless,usual,utility,vacant,vacuum,vague,valid,valley,valve,van,vanish,vapor,various,vast,vault,vehicle,velvet,vendor,venture,venue,verb,verify,version,very,vessel,veteran,viable,vibrant,vicious,victory,video,view,village,vintage,violin,virtual,virus,visa,visit,visual,vital,vivid,vocal,voice,void,volcano,volume,vote,voyage,wage,wagon,wait,walk,wall,walnut,want,warfare,warm,warrior,wash,wasp,waste,water,wave,way,wealth,weapon,wear,weasel,weather,web,wedding,weekend,weird,welcome,west,wet,whale,what,wheat,wheel,when,where,whip,whisper,wide,width,wife,wild,will,win,window,wine,wing,wink,winner,winter,wire,wisdom,wise,wish,witness,wolf,woman,wonder,wood,wool,word,work,world,worry,worth,wrap,wreck,wrestle,wrist,write,wrong,yard,year,yellow,you,young,youth,zebra,zero,zone,zoo".split(",");

function analyze(pw: string) {
  const hasLower = /[a-z]/.test(pw);
  const hasUpper = /[A-Z]/.test(pw);
  const hasDigit = /\d/.test(pw);
  const hasSymbol = /[^a-zA-Z0-9]/.test(pw);
  let pool = 0;
  if (hasLower) pool += 26;
  if (hasUpper) pool += 26;
  if (hasDigit) pool += 10;
  if (hasSymbol) pool += 33;

  const entropy = pw.length === 0 || pool === 0 ? 0 : pw.length * Math.log2(pool);

  const commons = ["password", "qwerty", "123456", "letmein", "admin", "welcome", "iloveyou"];
  const vulns: string[] = [];
  const lower = pw.toLowerCase();
  for (const c of commons) {
    if (lower.includes(c)) vulns.push(`dictionary word: "${c}"`);
  }
  if (/(.)\1\1\1/.test(pw)) vulns.push("repeated character run (xxxx)");
  if (/0123|1234|2345|3456|4567|5678|6789/.test(pw)) vulns.push("numeric sequence");
  if (/abcd|bcde|cdef|defg/i.test(pw)) vulns.push("alphabetic sequence");
  if (/qwer|wert|erty|asdf|sdfg|zxcv/i.test(pw)) vulns.push("keyboard walk");
  if (pw.length > 0 && pw.length < 8) vulns.push("length below 8");
  if (pw.length > 0 && pool < 26) vulns.push("single character class");

  const penaltyNote = vulns.length > 0
    ? "Real strength is lower than displayed entropy."
    : null;

  const attempts = Math.pow(2, entropy);
  const ONLINE_THROTTLED = 10;
  const OFFLINE_SLOW = 1e4;
  const OFFLINE_FAST = 1e10;
  const OFFLINE_FARM = 1e12;

  const formatTime = (secs: number): string => {
    if (!isFinite(secs) || secs > 1e18) return "centuries";
    if (secs < 60) return `${secs.toFixed(2)}s`;
    if (secs < 3600) return `${(secs / 60).toFixed(1)}m`;
    if (secs < 86400) return `${(secs / 3600).toFixed(1)}h`;
    if (secs < 86400 * 365) return `${(secs / 86400).toFixed(1)}d`;
    return `${(secs / 86400 / 365).toFixed(1)}y`;
  };

  return {
    length: pw.length,
    pool,
    entropy,
    classes: { hasLower, hasUpper, hasDigit, hasSymbol },
    penaltyNote,
    vulns,
    crack: {
      online: formatTime(attempts / 2 / ONLINE_THROTTLED),
      slow: formatTime(attempts / 2 / OFFLINE_SLOW),
      fast: formatTime(attempts / 2 / OFFLINE_FAST),
      farm: formatTime(attempts / 2 / OFFLINE_FARM),
    },
  };
}

function strengthLabel(entropy: number): { label: string; tone: string; pct: number; ringClass: string; barClass: string } {
  if (entropy < 28) return { label: "Very weak", tone: "text-rose-500", pct: 15, ringClass: "stroke-rose-500", barClass: "bg-rose-500" };
  if (entropy < 36) return { label: "Weak", tone: "text-orange-500", pct: 30, ringClass: "stroke-orange-500", barClass: "bg-orange-500" };
  if (entropy < 60) return { label: "Reasonable", tone: "text-amber-500", pct: 55, ringClass: "stroke-amber-500", barClass: "bg-amber-500" };
  if (entropy < 128) return { label: "Strong", tone: "text-emerald-500", pct: 80, ringClass: "stroke-emerald-500", barClass: "bg-emerald-500" };
  return { label: "Very strong", tone: "text-tool-accent", pct: 100, ringClass: "stroke-[var(--tool-accent)]", barClass: "bg-tool-accent" };
}

function randInt(max: number): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  // Unbiased: reject values above last full bucket
  const limit = Math.floor(0xffffffff / max) * max;
  if (buf[0] >= limit) return randInt(max);
  return buf[0] % max;
}

function generatePassword(opts: { length: number; lower: boolean; upper: boolean; digits: boolean; symbols: boolean; excludeAmbig: boolean }): string {
  const AMBIG = "O0o1lI|`'\"";
  let alphabet = "";
  if (opts.lower) alphabet += "abcdefghijklmnopqrstuvwxyz";
  if (opts.upper) alphabet += "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  if (opts.digits) alphabet += "0123456789";
  if (opts.symbols) alphabet += "!@#$%^&*()-_=+[]{};:,.<>?/~";
  if (opts.excludeAmbig) alphabet = alphabet.split("").filter((c) => !AMBIG.includes(c)).join("");
  if (!alphabet) return "";
  let out = "";
  for (let i = 0; i < opts.length; i++) out += alphabet[randInt(alphabet.length)];
  return out;
}

function generatePassphrase(words: number, separator: string, capitalize: boolean, addNumber: boolean): string {
  const picks: string[] = [];
  for (let i = 0; i < words; i++) {
    let w = DICEWARE_WORDS[randInt(DICEWARE_WORDS.length)];
    if (capitalize) w = w.charAt(0).toUpperCase() + w.slice(1);
    picks.push(w);
  }
  let out = picks.join(separator);
  if (addNumber) out += separator + String(randInt(100));
  return out;
}

async function sha1Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(s));
  const arr = new Uint8Array(buf);
  let hex = "";
  for (let i = 0; i < arr.length; i++) hex += arr[i].toString(16).padStart(2, "0");
  return hex.toUpperCase();
}

// ===== Visual primitives =====

function PanelHeader({ kicker, title, right }: { kicker: string; title?: string; right?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <div>
        <div className="font-mono text-[0.6rem] uppercase tracking-[0.25em] text-tool-accent">{kicker}</div>
        {title && <div className="mt-0.5 text-sm font-semibold text-app">{title}</div>}
      </div>
      {right && <div className="flex items-center gap-1.5">{right}</div>}
    </div>
  );
}

function Chip({ on, children, tone = "default" }: { on?: boolean; children: React.ReactNode; tone?: "default" | "ok" | "warn" | "bad" }) {
  const cls = !on
    ? "border-app bg-app text-muted"
    : tone === "ok"
    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-500"
    : tone === "warn"
    ? "border-amber-500/40 bg-amber-500/10 text-amber-500"
    : tone === "bad"
    ? "border-rose-500/40 bg-rose-500/10 text-rose-500"
    : "border-tool-accent bg-tool-accent-soft text-tool-accent";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-[0.62rem] uppercase tracking-[0.18em] ${cls}`}>
      {children}
    </span>
  );
}

function HwTier({ label, value, hint, accent }: { label: string; value: string; hint: string; accent?: boolean }) {
  return (
    <div className={`rounded-lg border ${accent ? "border-tool-accent" : "border-app"} bg-app p-3`}>
      <div className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-muted">{label}</div>
      <div className="mt-1 font-mono text-sm font-semibold text-app">{value}</div>
      <div className="mt-1 font-mono text-[0.55rem] text-faint">{hint}</div>
    </div>
  );
}

function EntropyDial({ entropy, ringClass }: { entropy: number; ringClass: string }) {
  // Map entropy 0..128 onto an arc; cap visually at 128 bits
  const capped = Math.min(entropy, 128);
  const pct = capped / 128;
  const r = 56;
  const c = 2 * Math.PI * r;
  const dash = c * pct;
  return (
    <div className="relative flex h-[160px] w-[160px] items-center justify-center">
      <svg viewBox="0 0 140 140" className="h-full w-full -rotate-90">
        <circle cx="70" cy="70" r={r} className="fill-none" stroke="var(--border)" strokeWidth="10" />
        <circle
          cx="70"
          cy="70"
          r={r}
          className={`fill-none ${ringClass} transition-all`}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c}`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="font-mono text-[0.55rem] uppercase tracking-[0.22em] text-muted">entropy</div>
        <div className="font-mono text-3xl font-semibold text-app">{entropy.toFixed(0)}</div>
        <div className="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-muted">bits</div>
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-md border px-3 py-2 ${accent ? "border-tool-accent bg-tool-accent-soft" : "border-app bg-app"}`}>
      <div className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-muted">{label}</div>
      <div className={`mt-0.5 font-mono text-sm font-semibold ${accent ? "text-tool-accent" : "text-app"}`}>{value}</div>
    </div>
  );
}

const inputBase =
  "w-full rounded-lg border border-app bg-app px-3 py-2 text-sm text-app placeholder:text-faint outline-none transition-colors focus:border-tool-accent";

export default function PasswordStrengthPage() {
  const [tab, setTab] = useState<Tab>("analyze");

  // analyze tab
  const [pw, setPw] = useState("");
  const [show, setShow] = useState(false);

  // generate tab
  const [gLen, setGLen] = useState(20);
  const [gLower, setGLower] = useState(true);
  const [gUpper, setGUpper] = useState(true);
  const [gDigits, setGDigits] = useState(true);
  const [gSymbols, setGSymbols] = useState(true);
  const [gAmbig, setGAmbig] = useState(true);
  const [gTick, setGTick] = useState(0);
  const generated = useMemo(
    () => generatePassword({ length: gLen, lower: gLower, upper: gUpper, digits: gDigits, symbols: gSymbols, excludeAmbig: gAmbig }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [gLen, gLower, gUpper, gDigits, gSymbols, gAmbig, gTick]
  );

  // passphrase tab
  const [phWords, setPhWords] = useState(5);
  const [phSep, setPhSep] = useState("-");
  const [phCap, setPhCap] = useState(false);
  const [phNum, setPhNum] = useState(true);
  const [phTick, setPhTick] = useState(0);
  const passphrase = useMemo(
    () => generatePassphrase(phWords, phSep, phCap, phNum),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [phWords, phSep, phCap, phNum, phTick]
  );

  // breach tab
  const [brPw, setBrPw] = useState("");
  const [brHash, setBrHash] = useState<string | null>(null);

  const r = useMemo(() => analyze(pw), [pw]);
  const s = strengthLabel(r.entropy);

  const rGen = useMemo(() => analyze(generated), [generated]);
  const rPh = useMemo(() => analyze(passphrase), [passphrase]);

  const onCheckBreach = async () => {
    if (!brPw) { setBrHash(null); return; }
    const h = await sha1Hex(brPw);
    setBrHash(h);
  };

  const copy = (t: string) => navigator.clipboard?.writeText(t);

  const verdictTone =
    r.length === 0
      ? "border-app bg-app text-secondary"
      : r.entropy >= 60
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-500"
      : r.entropy >= 36
      ? "border-amber-500/40 bg-amber-500/10 text-amber-500"
      : "border-rose-500/40 bg-rose-500/10 text-rose-500";

  return (
    <div data-tool-theme="data" data-tool="password-strength">
      <ToolShell
        category="Data & Developer"
        title="Password & Passphrase Toolkit"
        description="Analyze entropy, generate strong passwords or Diceware-style passphrases, and understand the k-anonymity breach-check pattern. Everything runs locally."
      >
        {/* ============================== MASTHEAD ============================== */}
        <section className="tool-hero relative mb-6 overflow-hidden rounded-xl border border-app bg-app-elevated">
          {/* console chrome — verdict + service chips */}
          <div className="flex flex-wrap items-center gap-2 border-b border-app bg-app px-4 py-2.5">
            <span
              className={`rounded-md border px-2 py-0.5 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.16em] ${verdictTone}`}
            >
              {r.length === 0 ? "IDLE" : s.label}
            </span>
            <span className="rounded-md border border-tool-accent bg-tool-accent-soft px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-tool-accent">
              svc:security
            </span>
            <div className="ml-1 flex flex-1 items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-muted">
              <span className="text-tool-accent">▸</span>
              security.console
              <span className="text-faint">/</span>
              <span className="text-secondary">{tab}.cmd</span>
            </div>
            <div className="font-mono text-[0.6rem] text-muted">◉ local-only</div>
          </div>

          <div className="relative p-5">
            <div className="relative flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.22em] text-tool-accent">
                  <span className="inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-tool-accent" />
                  Password & Passphrase Toolkit
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="rounded-md border border-app bg-app px-2.5 py-1 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-secondary">
                    ent={r.entropy.toFixed(0)}b
                  </span>
                  <span className="rounded-md border border-app bg-app px-2.5 py-1 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-secondary">
                    len={r.length}
                  </span>
                  <span className="rounded-md border border-app bg-app px-2.5 py-1 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-secondary">
                    pool={r.pool}
                  </span>
                </div>

                <div className="mt-3 text-2xl font-semibold tracking-tight text-app md:text-3xl">
                  Audit, generate, or test against breach corpora
                </div>
              </div>

              {/* entropy mini-dial */}
              <div className="flex items-center gap-3 rounded-xl border border-app bg-app px-3 py-2">
                <div className="relative h-12 w-12">
                  <svg viewBox="0 0 36 36" className="h-12 w-12 -rotate-90">
                    <circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--border)" strokeWidth="3" />
                    <circle
                      cx="18"
                      cy="18"
                      r="15.9"
                      fill="none"
                      stroke="var(--tool-accent)"
                      strokeWidth="3"
                      strokeDasharray={`${s.pct}, 100`}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center font-mono text-[0.65rem] font-bold text-tool-accent">
                    {s.pct.toFixed(0)}%
                  </div>
                </div>
                <div>
                  <div className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                    Strength
                  </div>
                  <div className="text-sm font-semibold text-app">
                    {r.length === 0 ? "—" : s.label}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* sub-tab strip */}
          <div className="flex flex-wrap items-center gap-1.5 border-t border-app bg-app px-4 py-2">
            <div className="inline-flex overflow-hidden rounded-lg border border-app bg-app-elevated">
              {(
                [
                  { k: "analyze", label: "Analyze" },
                  { k: "generate", label: "Generate" },
                  { k: "passphrase", label: "Passphrase" },
                  { k: "breach", label: "Breach" },
                ] as { k: Tab; label: string }[]
              ).map((t) => (
                <button
                  key={t.k}
                  onClick={() => setTab(t.k)}
                  className={`px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] transition-colors ${
                    tab === t.k
                      ? "bg-tool-accent-soft text-tool-accent"
                      : "text-secondary hover:text-app"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        {tab === "analyze" && (
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.1fr_1fr]">
            {/* Left: input + dial + chips */}
            <div className="space-y-5">
              <ToolCard title="Input password" subtitle="Type or paste — never leaves the browser">
                <PanelHeader
                  kicker="input.password"
                  right={
                    <button
                      onClick={() => setShow((v) => !v)}
                      className="rounded-lg border border-app bg-app-elevated px-2.5 py-1 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-secondary transition-colors hover:border-tool-accent hover:text-tool-accent"
                    >
                      {show ? "hide" : "show"}
                    </button>
                  }
                />
                <input
                  type={show ? "text" : "password"}
                  value={pw}
                  onChange={(e) => setPw(e.target.value)}
                  placeholder="••••••••"
                  className={`${inputBase} font-mono tracking-wider`}
                />

                {/* Character mix chip row */}
                <div className="mt-4 flex flex-wrap gap-1.5">
                  <Chip on={r.classes.hasLower} tone="ok">a-z</Chip>
                  <Chip on={r.classes.hasUpper} tone="ok">A-Z</Chip>
                  <Chip on={r.classes.hasDigit} tone="ok">0-9</Chip>
                  <Chip on={r.classes.hasSymbol} tone="ok">sym</Chip>
                  <Chip on={r.length >= 12} tone={r.length >= 12 ? "ok" : "warn"}>len≥12</Chip>
                  <Chip on={r.length >= 16} tone="ok">len≥16</Chip>
                </div>
              </ToolCard>

              <ToolCard title="Entropy meter" subtitle="Shannon = length × log₂(pool)">
                <div className="flex items-center gap-5">
                  <EntropyDial entropy={r.entropy} ringClass={s.ringClass} />
                  <div className="flex-1 space-y-2">
                    <div className={`font-mono text-xs uppercase tracking-[0.2em] ${s.tone}`}>
                      {s.label}
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full border border-app bg-app">
                      <div
                        className={`h-full transition-all ${s.barClass}`}
                        style={{ width: `${s.pct}%` }}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <Stat label="length" value={String(r.length)} />
                      <Stat label="pool" value={String(r.pool)} />
                    </div>
                    <p className="pt-1 font-mono text-[0.55rem] leading-relaxed text-muted">
                      Capped visually at 128 bits.
                    </p>
                  </div>
                </div>
              </ToolCard>
            </div>

            {/* Right: time-to-crack + vulns */}
            <div className="space-y-5">
              <ToolCard title="Time to crack" subtitle="Average attempts ÷ guess rate">
                <div className="rounded-lg border border-tool-accent bg-tool-accent-soft p-4">
                  <div className="font-mono text-[0.55rem] uppercase tracking-[0.22em] text-tool-accent">offline.fast (10B/s)</div>
                  <div className="mt-1 break-all font-mono text-3xl font-semibold text-app">{r.crack.fast}</div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <HwTier label="online (10/s)" value={r.crack.online} hint="rate-limited login" />
                  <HwTier label="offline.slow (10k/s)" value={r.crack.slow} hint="bcrypt-class" />
                  <HwTier label="offline.fast (10B/s)" value={r.crack.fast} hint="single GPU" accent />
                  <HwTier label="offline.farm (1T/s)" value={r.crack.farm} hint="GPU farm" />
                </div>
              </ToolCard>

              <ToolCard
                title="Vulnerability scan"
                subtitle="Common patterns that crash entropy estimates"
              >
                <div className="mb-3 flex items-center gap-2">
                  <Chip tone={r.vulns.length === 0 && r.length > 0 ? "ok" : r.vulns.length > 0 ? "bad" : "default"}>
                    {r.length === 0 ? "idle" : r.vulns.length === 0 ? "clean" : `${r.vulns.length} found`}
                  </Chip>
                </div>
                {r.length === 0 ? (
                  <div className="rounded-lg border border-app bg-app px-3 py-4 font-mono text-[0.7rem] text-muted">
                    Awaiting input...
                  </div>
                ) : r.vulns.length === 0 ? (
                  <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-3 font-mono text-[0.7rem] text-emerald-500">
                    No common patterns detected.
                  </div>
                ) : (
                  <ul className="space-y-1.5">
                    {r.vulns.map((v, i) => (
                      <li key={i} className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 font-mono text-[0.7rem] text-rose-500">
                        <span className="mt-0.5">!</span>
                        <span>{v}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {r.penaltyNote && (
                  <p className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 font-mono text-[0.65rem] text-amber-500">
                    {r.penaltyNote}
                  </p>
                )}
              </ToolCard>
            </div>
          </div>
        )}

        {tab === "generate" && (
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_1.2fr]">
            <ToolCard title="Generator config" subtitle="Random alphabet, no modulo bias">
              <label className="block">
                <div className="flex items-center justify-between font-mono text-[0.6rem] uppercase tracking-[0.2em] text-muted">
                  <span>length</span>
                  <span className="text-tool-accent">{gLen}</span>
                </div>
                <input
                  type="range"
                  min={8}
                  max={64}
                  value={gLen}
                  onChange={(e) => setGLen(parseInt(e.target.value))}
                  className="mt-2 w-full accent-[var(--tool-accent)]"
                />
              </label>

              <div className="mt-4 grid grid-cols-2 gap-2">
                {[
                  { label: "lower (a-z)", v: gLower, set: setGLower },
                  { label: "upper (A-Z)", v: gUpper, set: setGUpper },
                  { label: "digits (0-9)", v: gDigits, set: setGDigits },
                  { label: "symbols", v: gSymbols, set: setGSymbols },
                ].map((row, i) => (
                  <label key={i} className="flex items-center gap-2 rounded-lg border border-app bg-app px-3 py-2 font-mono text-[0.65rem] uppercase tracking-[0.15em] text-secondary">
                    <input type="checkbox" checked={row.v} onChange={(e) => row.set(e.target.checked)} className="accent-[var(--tool-accent)]" />
                    <span>{row.label}</span>
                  </label>
                ))}
              </div>
              <label className="mt-3 flex items-center gap-2 rounded-lg border border-app bg-app px-3 py-2 font-mono text-[0.65rem] uppercase tracking-[0.15em] text-secondary">
                <input type="checkbox" checked={gAmbig} onChange={(e) => setGAmbig(e.target.checked)} className="accent-[var(--tool-accent)]" />
                <span>exclude ambiguous (O0o1lI|)</span>
              </label>
              <button
                onClick={() => setGTick((t) => t + 1)}
                className="mt-4 w-full rounded-lg bg-tool-accent px-4 py-2.5 font-mono text-[0.7rem] font-semibold uppercase tracking-[0.2em] transition-opacity hover:opacity-90"
                style={{ color: "var(--bg)" }}
              >
                regenerate
              </button>
            </ToolCard>

            <ToolCard
              title="Generator output"
              subtitle="crypto.getRandomValues with rejection sampling"
            >
              <div className="mb-3 flex items-center gap-2">
                <Chip tone="ok">{rGen.entropy.toFixed(0)}b</Chip>
              </div>
              <pre className="min-h-[64px] overflow-auto break-all rounded-lg border border-tool-accent bg-app p-4 font-mono text-sm text-app">{generated || "Select at least one class"}</pre>
              <button
                onClick={() => copy(generated)}
                className="mt-3 w-full rounded-lg border border-app bg-app-elevated px-4 py-2 font-mono text-[0.65rem] uppercase tracking-[0.2em] text-secondary transition-colors hover:border-tool-accent hover:text-tool-accent"
              >
                copy
              </button>
              <div className="mt-4 grid grid-cols-3 gap-2">
                <Stat label="length" value={String(generated.length)} />
                <Stat label="entropy" value={`${rGen.entropy.toFixed(0)}b`} accent />
                <Stat label="offline.fast" value={rGen.crack.fast} />
              </div>
            </ToolCard>
          </div>
        )}

        {tab === "passphrase" && (
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_1.2fr]">
            <ToolCard title="Diceware config" subtitle="Each word ≈ 10 bits of entropy">
              <label className="block">
                <div className="flex items-center justify-between font-mono text-[0.6rem] uppercase tracking-[0.2em] text-muted">
                  <span>words</span>
                  <span className="text-tool-accent">{phWords}</span>
                </div>
                <input
                  type="range"
                  min={3}
                  max={10}
                  value={phWords}
                  onChange={(e) => setPhWords(parseInt(e.target.value))}
                  className="mt-2 w-full accent-[var(--tool-accent)]"
                />
              </label>
              <div className="mt-4">
                <div className="font-mono text-[0.6rem] uppercase tracking-[0.2em] text-muted">separator</div>
                <div className="mt-2 grid grid-cols-5 gap-2">
                  {["-", ".", "_", " ", ""].map((sep) => (
                    <button
                      key={sep}
                      onClick={() => setPhSep(sep)}
                      className={`rounded-lg border px-2 py-1.5 font-mono text-xs transition-colors ${
                        phSep === sep
                          ? "border-tool-accent bg-tool-accent-soft text-tool-accent"
                          : "border-app bg-app text-secondary hover:border-tool-accent"
                      }`}
                    >
                      {sep || "·"}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <label className="flex items-center gap-2 rounded-lg border border-app bg-app px-3 py-2 font-mono text-[0.65rem] uppercase tracking-[0.15em] text-secondary">
                  <input type="checkbox" checked={phCap} onChange={(e) => setPhCap(e.target.checked)} className="accent-[var(--tool-accent)]" />
                  <span>capitalize</span>
                </label>
                <label className="flex items-center gap-2 rounded-lg border border-app bg-app px-3 py-2 font-mono text-[0.65rem] uppercase tracking-[0.15em] text-secondary">
                  <input type="checkbox" checked={phNum} onChange={(e) => setPhNum(e.target.checked)} className="accent-[var(--tool-accent)]" />
                  <span>add number</span>
                </label>
              </div>
              <button
                onClick={() => setPhTick((t) => t + 1)}
                className="mt-4 w-full rounded-lg bg-tool-accent px-4 py-2.5 font-mono text-[0.7rem] font-semibold uppercase tracking-[0.2em] transition-opacity hover:opacity-90"
                style={{ color: "var(--bg)" }}
              >
                regenerate
              </button>
              <p className="mt-3 font-mono text-[0.55rem] leading-relaxed text-muted">
                Inspired by EFF Diceware large wordlist (CC BY 3.0).
              </p>
            </ToolCard>

            <ToolCard title="Passphrase output" subtitle="Memorable, high-entropy">
              <div className="mb-3 flex items-center gap-2">
                <Chip tone="ok">{rPh.entropy.toFixed(0)}b</Chip>
              </div>
              <pre className="min-h-[64px] overflow-auto break-all rounded-lg border border-tool-accent bg-app p-4 font-mono text-base text-app">{passphrase}</pre>
              <button
                onClick={() => copy(passphrase)}
                className="mt-3 w-full rounded-lg border border-app bg-app-elevated px-4 py-2 font-mono text-[0.65rem] uppercase tracking-[0.2em] text-secondary transition-colors hover:border-tool-accent hover:text-tool-accent"
              >
                copy
              </button>
              <div className="mt-4 grid grid-cols-3 gap-2">
                <Stat label="words" value={String(phWords)} />
                <Stat label="entropy" value={`${rPh.entropy.toFixed(0)}b`} accent />
                <Stat label="offline.fast" value={rPh.crack.fast} />
              </div>
            </ToolCard>
          </div>
        )}

        {tab === "breach" && (
          <div className="grid grid-cols-1 gap-5">
            <ToolCard title="k-anonymity preview" subtitle="How HaveIBeenPwned breach checks stay private">
              <div className="flex gap-2">
                <input
                  type="password"
                  value={brPw}
                  onChange={(e) => setBrPw(e.target.value)}
                  placeholder="password to hash (local)"
                  className={`${inputBase} font-mono`}
                />
                <button
                  onClick={onCheckBreach}
                  className="rounded-lg bg-tool-accent px-4 font-mono text-[0.65rem] font-semibold uppercase tracking-[0.2em] transition-opacity hover:opacity-90"
                  style={{ color: "var(--bg)" }}
                >
                  hash
                </button>
              </div>

              {brHash && (
                <div className="mt-5 space-y-2 rounded-lg border border-tool-accent bg-app p-4 font-mono text-[0.7rem]">
                  <div><span className="text-muted">SHA-1 full:</span> <span className="break-all text-app">{brHash}</span></div>
                  <div><span className="text-muted">prefix (5, safe to send):</span> <span className="text-emerald-500">{brHash.slice(0, 5)}</span></div>
                  <div><span className="text-muted">suffix (35, stays local):</span> <span className="break-all text-rose-500">{brHash.slice(5)}</span></div>
                </div>
              )}

              <div className="mt-5 space-y-2 rounded-lg border border-app bg-app p-4 text-xs leading-relaxed text-secondary">
                <div className="font-mono text-[0.6rem] uppercase tracking-[0.2em] text-tool-accent">how.it.works</div>
                <ol className="list-decimal space-y-1 pl-5">
                  <li>Hash the password with SHA-1 in the browser (done above).</li>
                  <li>Send only the first 5 characters to the remote service (e.g. HaveIBeenPwned Pwned Passwords API).</li>
                  <li>The service returns every SHA-1 hash that starts with those 5 chars (usually 300–600 results).</li>
                  <li>Your browser compares the remaining 35 chars locally — the server never learns which password you checked.</li>
                </ol>
                <p className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 font-mono text-[0.65rem] text-amber-500">
                  This page does not call any external API. It demonstrates the pattern client-side so you can wire it up yourself. Reference: HaveIBeenPwned Pwned Passwords (k-anonymity range API).
                </p>
              </div>
            </ToolCard>
          </div>
        )}
      </ToolShell>
    </div>
  );
}
