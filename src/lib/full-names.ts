/**
 * Turn the shortened, all-caps names in the state's lists into full names, word for word:
 *   "COMM MAINSTREAMING INC SPT"            -> "Community Mainstreaming"
 *   "CENTER F/DEVELOPMENTAL DISABILITIES  INC" -> "Center for Developmental Disabilities"
 *   "WESTERN NY DDSO"                        -> "Western New York Developmental Disabilities Services Office"
 *
 * Program codes the Medicaid listing adds to a site's name (DAY, SPV, ICF...) are dropped, since the map already
 * lists each site's services, and so are "Inc.", "Ltd." and "LLC". Organizations whose actual name is an acronym
 * (YAI, AHRC, NYSARC, The Arc, OPWDD...) keep it.
 */

// Abbreviations and cut-off words -> full words. Keys are upper case, without periods.
const WORDS: Record<string, string> = {
  // general
  SVCS: "Services", SVC: "Services", SRVS: "Services", SRV: "Services", SERVS: "Services", SERV: "Services", SRVC: "Services",
  SRVCS: "Services", SVS: "Services", SER: "Services", SV: "Services",
  CTR: "Center", CNTR: "Center", CENTE: "Center", CTE: "Center", CTRS: "Centers",
  ASSOC: "Association", ASSN: "Association", ASSO: "Association", COUN: "Council", CNCL: "Council",
  CO: "County", CNTY: "County", CTY: "County", CTRY: "Country",
  CHAP: "Chapter", CHPT: "Chapter", COMM: "Community", COM: "Community", CORP: "Corporation", CRP: "Corporation",
  DEV: "Developmental", DEVELOP: "Developmental", DIS: "Disabilities", DISAB: "Disabilities", DISABIL: "Disabilities",
  DD: "Developmental Disabilities", DDS: "Developmental Disabilities Services",
  INST: "Institute", INSTITUT: "Institute", INDEP: "Independent", IND: "Industries", INDUS: "Industries",
  PRGRM: "Program", PROGR: "Program", PROGS: "Programs", RES: "Residences", RESID: "Residence", RESI: "Residence",
  RESRC: "Resource", RSRC: "Resource", HLTH: "Health", MED: "Medical", HOSP: "Hospital", FDTN: "Foundation",
  FND: "Foundation", FOUND: "Foundation", ORG: "Organization", ENT: "Enterprises", ENTE: "Enterprises", ESS: "Essential",
  ESSENT: "Essential", FAM: "Family", CHLD: "Children", CHLDN: "Children", CHDN: "Children", CHLDRN: "Children",
  CHILDRN: "Children", CHIL: "Children", CHI: "Children", CHILDRENS: "Children's", CHRISTOPHERS: "Christopher's",
  EXCPT: "Exceptional", EXCPTNL: "Exceptional", HAB: "Habilitation", LIV: "Living", LVNG: "Living", LVING: "Living",
  GP: "Group", GR: "Greater", GRP: "Group", GTR: "Greater", HM: "Home", HSE: "House", GRHM: "Group Home",
  SOC: "Society", CHAR: "Charities", CATH: "Catholic", DIO: "Diocese", REC: "Recreation", DEPT: "Department",
  SPEC: "Special", CIT: "Citizens", UNLID: "Unlimited", UNLTD: "Unlimited", NETWK: "Network", REF: "Referral",
  INFO: "Information", MENT: "Mentally", ILL: "Ill", ADV: "Advancement", RET: "Retarded", NEUR: "Neurologically",
  NEUROL: "Neurologically", IMP: "Impaired", INJ: "Injured", SYN: "Syndrome", SYND: "Syndrome", DOWNS: "Down",
  AUT: "Autistic", SCHL: "School", LANG: "Language", AMER: "American", UN: "United", ACT: "Action",
  PPLE: "People", PPL: "People", PERS: "Persons", HANDI: "Handicapped", HUM: "Human", ENVIRONMTS: "Environments",
  INITIATVES: "Initiatives", EXP: "Experience", EX: "Experience", FRAG: "Fragile", INF: "Infants", CR: "Care",
  BLDG: "Building", BLD: "Building", BKLYN: "Brooklyn", ROCHESTE: "Rochester", ROCH: "Rochester",
  BUFF: "Buffalo", SCHEN: "Schenectady", SCHDY: "Schenectady", SCHTY: "Schenectady", RENSS: "Rensselaer",
  TIOG: "Tioga", ALB: "Albany", JAMAI: "Jamaica", CASTLTN: "Castleton", NGBHD: "Neighborhood", INPROV: "Improvement",
  ADC: "Adult Day Center", CDC: "Child Development Center", BL: "Blind", MULTIHAN: "Multihandicapped",
  RIV: "Riverdale", PK: "Park", TWR: "Tower", LTL: "Little", VLG: "Village", CONF: "Conference",
  DIST: "Disabilities", DISC: "Discovery", DISCVRY: "Discovery", EPISC: "Episcopal", MIS: "Mission",
  PLAN: "Planning", CULT: "Cultural", HLPRS: "Helpers", BEHVRL: "Behavioral", REBLD: "Rebuilding", INCL: "Inclusion",
  CAY: "Cayuga", MULT: "Multi", BD: "Board", RVC: "Rockville Centre", ED: "Educational", CARD: "Cardinal",
  SAINT: "Saint", ST: "Saint", MT: "Mount", AVE: "Avenue", AV: "Avenue", RD: "Road", BLVD: "Boulevard", DR: "Drive",
  CT: "Court", HE: "Head", ARMST: "Armstrong", OPP: "Opportunities", ASST: "Assistance", APP: "Applied",
  DYN: "Dynamics", DYNA: "Dynamics", NYSAC: "NYSARC", F: "for", W: "with",
  // places and organizations
  NY: "New York", NYS: "New York State", NYC: "New York City", LI: "Long Island", SI: "Staten Island",
  CNY: "Central New York", WNY: "Western New York", NENY: "Northeastern New York", GNY: "Greater New York",
  NE: "Northeast", SE: "Southeast", SO: "Southern", UCP: "United Cerebral Palsy", UCPA: "United Cerebral Palsy Association",
  CP: "Cerebral Palsy", DC: "Developmental Center", DDSO: "Developmental Disabilities Services Office",
  DDSOO: "Developmental Disabilities State Operations Office", SUNY: "State University of New York",
  SDTC: "SDTC", FREE: "Family Residences and Essential Enterprises", YM: "Young Men's", YWHA: "Young Women's Hebrew Association", IAHD: "Institute for Applied Human Dynamics",
};

// Names that cannot be rebuilt word by word (cut off mid-word or ambiguous), checked by hand.
// Keys: the name as listed (upper case, single spaces).
const OVERRIDES: Record<string, string> = {
  "JEWISH CHILD CARE ASSOCIATION OF NE": "Jewish Child Care Association of New York",
  "CHINESE-AMERICAN PLANNING COUNCIL O": "Chinese-American Planning Council",
  "CHINESE AMERICAN PLAN SPV": "Chinese-American Planning Council",
  "KINGSBRIDGE HEIGHTS COMMUNITY CENTE": "Kingsbridge Heights Community Center",
  "CATHOLIC CHARITIES OF ONONDAGA COUN": "Catholic Charities of Onondaga County",
  "CATHOLIC CHARITIES OF TOMPKINS/TIOG": "Catholic Charities of Tompkins and Tioga",
  "WRAPAROUND SERVICES OF THE HUDSON V": "Wraparound Services of the Hudson Valley",
  "ADULTS AND CHILDREN W/LEARNING AND": "Adults and Children with Learning and Developmental Disabilities",
  "ADULTS & CHILDREN W/ LEARNING & DD": "Adults and Children with Learning and Developmental Disabilities",
  "THE INSTITUTES OF APPLIED HUMAN DYN": "Institutes of Applied Human Dynamics",
  "DEVELOPMENTAL DISABILITIES INSTITUT": "Developmental Disabilities Institute",
  "INDEPENDENT GROUP HOME LIVING PROGR": "Independent Group Home Living Program",
  "UNITED CEREBRAL PALSY ASSOCIATIONS": "United Cerebral Palsy Associations of New York State",
  "CITY OF YONKERS DEPT OF PARKS & R": "City of Yonkers Department of Parks and Recreation",
  "SHELTERING ARMS CHILDREN/FAMILY SVC": "Sheltering Arms Children and Family Services",
  "SHELTERING ARMS CHILDREN AND FAMILY": "Sheltering Arms Children and Family Services",
  "EVELYN DOUGLIN CTE SERV PEOPLE IN N": "Evelyn Douglin Center for Serving People in Need",
  "E DOUGLIN CTR/SERV PPLE SPV": "Evelyn Douglin Center for Serving People in Need",
  "E DOUGHLIN CTR SVC PPLE DAY": "Evelyn Douglin Center for Serving People in Need",
  "EPISC MIS SOC METRO N (1956)": "Episcopal Mission Society",
  "ASSOC MENT ILL CHILD WEST SPV": "Association for Mentally Ill Children of Westchester",
  "ASSOC MENT ILL CHILD W DAY": "Association for Mentally Ill Children of Westchester",
  "HAITIAN AMER UN/ PROGR DAY": "Haitian Americans United for Progress",
  "SPECIAL CIT FUTURE UNLID DAY": "Special Citizens Futures Unlimited",
  "SPECIAL CIT FUTURE UNLTD SPT": "Special Citizens Futures Unlimited",
  "EAST HARLEM CNCL F/COMM INPROV DAY": "East Harlem Council for Community Improvement",
  "LONGLIFE INFO/REF NETWK DAY": "Long Life Information and Referral Network",
  "LONG LIFE INFO & REFERRAL NETWORK": "Long Life Information and Referral Network",
  "COMM AID F/RETARD CHIL DAY": "Community Aid for Retarded Children",
  "NYS ASSO RETARDED CHLDN AGOVI": "New York State Association for Retarded Children",
  "DAYSTAR FOR MEDICALLY FRAG INF DAY": "Daystar for Medically Fragile Infants",
  "IRI: INNOVATIVE RES FOR INDEPEND INC.": "IRI: Innovative Resources for Independence",
  "MEANINGFUL NY INITIATVES PPL W/DISAB INC": "Meaningful New York Initiatives for People with Disabilities",
  "HUMANITARIAN ORG. FOR MULTICULTURAL EXP.": "Humanitarian Organization for Multicultural Experience",
  "HUMANITARIAN ORG MULTI EX DAY": "Humanitarian Organization for Multicultural Experience",
  "SOUTHEAST CONSORTIUM F/SPEC SVCS OP": "Southeast Consortium for Special Services",
  "ST REGIS MOHAWK ED AND COMM FUND SP": "Saint Regis Mohawk Education and Community Fund",
  "ASSN F/NEUR IMP BRAIN INJ SPV": "Association for Neurologically Impaired Brain Injured Children",
  "ASSOC NEUROL IMPAIRED DAY": "Association for Neurologically Impaired Brain Injured Children",
  "ASSOC FOR ADV BLIND & RET SPV": "Association for the Advancement of Blind and Retarded Persons",
  "ADVOCATES SVC BL MULTIHAN RIV": "Advocates for Services for the Blind Multihandicapped",
  "ADVOCATES FOR SERVICES SPV": "Advocates for Services for the Blind Multihandicapped",
  "VICTOR ASSOC CULT ARTS DAY": "Victor Association for Cultural Arts",
  "MENTAL HLTH ASSO NASSAU TERR": "Mental Health Association of Nassau County",
  "PAUL J COOPER CTR F/ HS SPT": "Paul J. Cooper Center for Human Services",
  "PAUL J. COOPER CTR FOR HUMAN SVCS": "Paul J. Cooper Center for Human Services",
  "UCP & HANDI PERS UTICA SPV": "United Cerebral Palsy and Handicapped Persons Association of the Utica Area",
  "LORD OF LIFE ADULT/CHI DAY": "Lord of Life Adult and Children's Day Program",
  "GROTON COMM HLTH CARE CTR SPV": "Groton Community Health Care Center",
  "SCHOOL FOR LANG/COMM DEV DAY/CH": "School for Language and Communication Development",
  "CANTALICIAN CTR LEARN DAY": "Cantalician Center for Learning",
  "LAKE SHORE CHILD CR CTR DAY": "Lake Shore Child Care Center",
  "ASSOC /CHILDREN WITH DOWN DAY/AHRH": "Association for Children with Down Syndrome",
  "ASSOC F/CHILD W/DOWN SYN SPV": "Association for Children with Down Syndrome",
  "ASSN FOR CHILDREN W/DOWNS SYND SPT": "Association for Children with Down Syndrome",
  "REWARDING ENVIRONMTS FOR ADULT LVNG INC": "Rewarding Environments for Adult Living",
  "UNITED HLPRS BEHVRL HEALTH & LIFE SKILLS": "United Helpers Behavioral Health and Life Skills",
  "PEOPLE REBLD-LVNG DIGNITY DAY": "People Rebuilding Living Dignity",
  "COMMUNITY PRO-WCH JCS BON AIR": "Community Programs of Westchester Jewish Community Services",
  "COMMUNITY PROGS OF WJCS DAY": "Community Programs of Westchester Jewish Community Services",
  "COMMUNITY PROGRAMS OF WJCS": "Community Programs of Westchester Jewish Community Services",
  "JEWISH COMM CTR/GR BUFF DAY": "Jewish Community Center of Greater Buffalo",
  "CATHOLIC CHAR DIO RVC SPT": "Catholic Charities of the Diocese of Rockville Centre",
  "CATH CHARITIES DIO ROCH SPT": "Catholic Charities of the Diocese of Rochester",
  "CATHOLIC CHARITIES OF THE DIOCESE OF ALB": "Catholic Charities of the Diocese of Albany",
  "HANDICAPPED CHILD SO NY DAY": "The Handicapped Children's Association of Southern New York",
  "GOODWILL IND GR NY/NJ DAY": "Goodwill Industries of Greater New York and Northern New Jersey",
  "GOODWILL INDUS. OF GREATER NY": "Goodwill Industries of Greater New York",
  "CAY COMM SVC ORG INC": "Cayuga County Community Services Organization",
  "SAMUEL FIELD YM AND YWHA INC OPWDD": "Samuel Field Young Men's and Young Women's Hebrew Association",
  "SUNY PLATTSBURGH NYSADAC DAY": "State University of New York at Plattsburgh",
  "S.U.N.Y. PLATTSBURGH": "State University of New York at Plattsburgh",
  "TERENCE CARD COOKE ST THERESA": "Terence Cardinal Cooke Health Care Center",
  "CITY OF MOUNT VERNON REC DEPT OPWDD": "City of Mount Vernon Recreation Department",
  "WHITE PLAINS REC OPWDD MULTI": "White Plains Recreation Department",
  "NE WESTCHESTER SPEC/REC OPWDD MULTI": "Northeast Westchester Special Recreation",
  "CATHOLIC GUARD SOC E HAMPTON": "Catholic Guardian Society",
  "CATHOLIC GUARD SOC LACOMBE AV": "Catholic Guardian Society",
  "FAMILY RESIDENCE & ESS ENT": "Family Residences and Essential Enterprises",
  "FAMILY RESIDENCE AND ESSENTIAL ENTE": "Family Residences and Essential Enterprises",
  "FAMILY RESID AND ESSENT ENTERPRISES INC": "Family Residences and Essential Enterprises",
  "LIFES WORC DAY": "Life's WORC",
  "LIFE'S W.O.R.C. INC.": "Life's WORC",
  "CATHOLIC CHAR DDS DAY": "Catholic Charities Developmental Disabilities Services",
  "CATHOLIC CHARITIES DDS SPV": "Catholic Charities Developmental Disabilities Services",
  "CATHOLIC CHARITIES FAM AND COMM SVCS DBA": "Catholic Charities Family and Community Services",
  "CATH CHAR COMM RES SVC DAY": "Catholic Charities Community Residential Services",
  "GE PRIELMCREST CHILDRENS CENTER DAY": "George E. Prielmcrest Children's Center",
  "DEVELOPMENTAL DIS INST 197 OL": "Developmental Disabilities Institute",
  "DEVELOPMENTAL DIST INST DAY": "Developmental Disabilities Institute",
  "MULTI-COUNTY CDC DAY": "Multi-County Community Development Corporation",
  "COMMUNITY ACTION F/HUM SV SPV": "Community Action for Human Services",
  "COMM ACTION/HUMAN SVCS DAY": "Community Action for Human Services",
  "OTSAR INC DAY": "Otsar Family Services",
  "IBERO AMERICAN ACT LEAGUE SPT": "Ibero-American Action League",
  "IBERO - AMERICAN ACTION LEAGUE": "Ibero-American Action League",
  "STATEN ISLAND DDSO SPV/SVT": "Staten Island Developmental Disabilities Services Office",
  "STATEN ISLAND DDSO 24A EXEC W": "Staten Island Developmental Disabilities Services Office",
  "LONG ISLAND DDSO DT": "Long Island Developmental Disabilities Services Office",
  "SUNMOUNT DDSO SRU #1": "Sunmount Developmental Disabilities Services Office",
  "WASSAIC DC PRYOR HOUSE ICF": "Wassaic Developmental Center",
  "BADEN ST SETTLEMENT MULTI": "Baden Street Settlement",
  "ST JOHNS CHRISTIAN ACADEMY OPWDD": "Saint John's Christian Academy",
  "ST CHRISTOPHERS OTTILIE KEW": "Saint Christopher-Ottilie",
  "ST CHRISTOPHERS-OTTILIE JAMAI": "Saint Christopher-Ottilie",
  "ST CHRISTOPHER OTTILIE SPT": "Saint Christopher-Ottilie",
  "THE GRACE FDTN OF NY DAY": "The Grace Foundation of New York",
  "THE ALTERNATIVE LIV GRP SPV": "The Alternative Living Group",
  "EDEN II SCHL AUT/CHILD DAY": "Eden II School for Autistic Children",
  "EDWIN GOULD SRV CHLDRN FOLKES": "Edwin Gould Services for Children and Families",
  "LITTLE VILLAGE HSE LTL VLG IC": "Little Village House",
  "SOUTHEAST BRONX NGBHD CTR DAY": "Southeast Bronx Neighborhood Center",
  "URBAN LEAGUE OF ROCHESTE DAY": "Urban League of Rochester",
  "URBAN RESOURCE INST PRIMM ICF": "Urban Resource Institute",
  "DELAWARE OPP INC DAY": "Delaware Opportunities",
  "INDEPENDENCE RES INC DAY": "Independence Residences",
  "UCP OF TRI COUNTIES DAY": "United Cerebral Palsy of the Tri-Counties",
  "E. JOHN GAVRAS CENTER (DBA)": "E. John Gavras Center",
  "JM MURRAY CTR INC DAY": "J. M. Murray Center",
  "J. M. MURRAY CENTER INC.": "J. M. Murray Center",
  "L ARCHE SYRACUSE INC SPV": "L'Arche Syracuse",
  "ITS MY PLACE INC": "It's My Place",
  "LDA OF CENTRAL NY DAY/AHRH": "Learning Disabilities Association of Central New York",
  "UCPA OF THE NORTH CTRY DAY": "United Cerebral Palsy Association of the North Country",
  "COMM RESOURCE CTR F/OD DAY": "Community Resource Center for the Developmentally Disabled",
  "COMMUNITY RESOURCE CENTER FOR DD": "Community Resource Center for the Developmentally Disabled",
  "COMM RESOURCE CTR F/DD SPV": "Community Resource Center for the Developmentally Disabled",
};

// Acronyms that are the organization's own name (or a name part with no spelled-out form), kept in capitals
const KEEP_CAPS = new Set([
  "ARC", "NYSARC", "YAI", "AHRC", "HASC", "QSAC", "OPWDD", "BOCES", "YMCA", "YWCA", "CDS", "ICL", "SCO", "PSCH", "ACLD",
  "AABR", "CFS", "CHDFS", "WJCS", "IKAN", "SPARC", "SASI", "COARC", "VACPA", "RCAL", "RICL", "STIC", "ACDS", "AMIC", "ASBM",
  "OLV", "SDTC", "GLOW", "EPIC", "CERC", "LDA", "IRI", "MSC", "WORC", "SKIP", "BRIDGES", "NYSADAC", "II", "III", "IV", "TBI",
  "ADAPT", "AIM", "ARISE", "HALO",
]);
// Small words written in lower case (except at the start)
const SMALL = new Set(["of", "for", "the", "and", "in", "on", "at", "to", "with", "a", "an", "by"]);

// Medicaid program codes and corporate endings that are not part of the name
const PROGRAM_CODES = new Set(["DAY", "SPV", "SPT", "ICF", "ICFA", "IRA", "CH", "AHRH", "MULTI", "MULT", "MU", "OPW", "OPWDD", "HCBS",
  "PRE", "SP", "IC", "I", "A", "B", "C", "OP"]);
const CORPORATE = new Set(["INC", "INCORPORATED", "LTD", "LLC", "DBA", "PLLC", "PC"]);
// Program codes that can sit in the middle of a site's name ("UCP GREATER SUFFOLK ICF #1")
const MIDDLE_CODES = new Set(["ICF", "ICFA", "IRA", "SPV", "SPT", "HCBS", "OPWDD"]);

function titleWord(word: string, first: boolean): string {
  if (/^\d/.test(word)) return word.toLowerCase();
  const lower = word.toLowerCase();
  if (!first && SMALL.has(lower)) return lower;
  return lower.split("-").map((part) => {
    if (KEEP_CAPS.has(part.toUpperCase())) return part.toUpperCase();
    if (/^mc[a-z]/.test(part)) return `Mc${part[2].toUpperCase()}${part.slice(3)}`;
    if (/^o'[a-z]/.test(part)) return `O'${part[2].toUpperCase()}${part.slice(3)}`;
    return part.charAt(0).toUpperCase() + part.slice(1);
  }).join("-");
}

/** Full, word-for-word display name for a name as listed by the state. */
export function fullName(listed: string): string {
  const raw = listed.toUpperCase().replace(/\s+/g, " ").trim();
  if (OVERRIDES[raw]) return OVERRIDES[raw];

  let s = raw
    .replace(/^\d+\s*-\s*/, "")                       // "0225 - SUNMOUNT DDSO"
    .replace(/\b(DAY|SPV|SPT)\/(CH|AHRH|SPT|SVT|SPV)\b/g, "$1")   // "DAY/CH", "SPV/SPT" program codes
    .replace(/\b([A-Z])\.(?=[A-Z]\.)/g, "$1")          // "A.C.L.D." -> "ACLD."
    .replace(/\b(?:[A-Z] ){2,}[A-Z]\b/g, (m) => m.replace(/ /g, "")) // "A A B R" -> "AABR"
    .replace(/\bN ?Y ?S\b/g, "NYS").replace(/\bNYS ARC\b/g, "NYSARC")
    .replace(/\bF\/T\b/g, " FOR THE ").replace(/\bF\//g, " FOR ").replace(/\bW\//g, " WITH ")
    .replace(/\s*\/\s*/g, " AND ").replace(/&/g, " AND ")
    .replace(/[,:]/g, " ").replace(/\((?:DBA|THE)\)/g, (m) => (m === "(THE)" ? " %THE% " : " "));
  const movedThe = s.includes("%THE%");
  s = s.replace("%THE%", " ");

  s = s.replace(/\bLONG IS\b/g, "LONG ISLAND").replace(/\(([^)]*\d[^)]*)\)/g, " ").replace(/[()]/g, " ");   // drop "(1956)"-style notes
  let words = s.split(" ").map((w) => w.replace(/\.+$/, "").replace(/^'+|'+$/g, "")).filter(Boolean);
  words = words.filter((w) => !CORPORATE.has(w) && !MIDDLE_CODES.has(w));
  // Drop program codes, numbers and "#5"-style site numbers from the end
  while (words.length > 1 && (PROGRAM_CODES.has(words[words.length - 1]) || /^#?\d/.test(words[words.length - 1]))) words.pop();
  // "PEOPLE INC - HCBS IRA 9 SPV": a dash before program codes
  if (words[words.length - 1] === "-") words.pop();

  const expanded = words.map((w, i) => {
    if (w === "-") return "-";
    // ST is "Saint" before a name ("ST LAWRENCE") and "Street" after one ("JAMES ST")
    if (w === "ST") return i < words.length - 1 ? "Saint" : "Street";
    return w.split("-").map((p) => WORDS[p] ?? p).join("-");
  }).join(" ").split(" ");
  if (movedThe && expanded[0] !== "THE") expanded.unshift("THE");

  const name = expanded.map((w, i) => titleWord(w, i === 0)).join(" ")
    .replace(/ - /g, " – ").replace(/\s+/g, " ").trim();
  return name;
}

// Names that start like this belong to this agency (checked by hand; the rest of the listed name is a site or cut off)
const AGENCY_BY_START: [string, string][] = [
  ["Paul J", "Paul J. Cooper Center for Human Services"],
  ["Community Pro-Wch", "Community Programs of Westchester Jewish Community Services"],
  ["Evelyn Douglin", "Evelyn Douglin Center for Serving People in Need"],
  ["Community Work", "Community, Work and Independence"],
  ["Aid Developmental", "Aid to the Developmentally Disabled"],
  ["Aid to", "Aid to the Developmentally Disabled"],
  ["Mary Cariola", "Mary Cariola Children's Center"],
  ["Rochester School of", "The Rochester School of the Holy Childhood"],
  ["Southern Tier Independ", "Southern Tier Independence Center"],
  ["United Cerebral Palsy and Utica", "United Cerebral Palsy and Handicapped Persons Association of the Utica Area"],
  ["United Cerebral Palsy Utica", "United Cerebral Palsy and Handicapped Persons Association of the Utica Area"],
  ["United Cerebral Palsy Greater Suffolk", "United Cerebral Palsy Association of Greater Suffolk"],
  ["Open Gate", "Open Gate"],
  ["Jewish Board", "Jewish Board of Family and Children's Services"],
  ["Groton Communitu", "Groton Community Health Care Center"],
  ["Innovative Resources for Independen", "Innovative Resources for Independence"],
  ["Little Flower Children", "Little Flower Children and Family Services"],
  ["Meaningful New York", "Meaningful New York Initiatives for People with Disabilities"],
  ["Unity Hs", "Unity House of Cayuga County"],
  ["Communtiy Services", "Community Services for Every1"],
  ["Cntro Society La Esp", "Centro Social La Esperanza"],
  ["Cheung-Schuyler", "Chemung-Schuyler Counties Chapter NYSARC"],
  ["Catholic Charities Nghbhd", "Catholic Charities Neighborhood Services"],
  ["United Cerebral Palsy New York State", "United Cerebral Palsy Associations of New York State"],
  ["United Cerebral Palsy and New York State", "United Cerebral Palsy Associations of New York State"],
  ["United Cerebral Palsy of New York State", "United Cerebral Palsy Associations of New York State"],
  ["United Cerebral Palsy Association of New York State", "United Cerebral Palsy Associations of New York State"],
  ["ADAPT of the Hudson Valley", "ADAPT of the Hudson Valley"],
  ["B Fineson Developmental Center", "Bernard M. Fineson Developmental Center"],
  ["Broome Developmental Center", "Broome Developmental Center"],
  ["Catholic Charities Diocese Rochester", "Catholic Charities of the Diocese of Rochester"],
  ["Catholic Charities Diocese Rockville", "Catholic Charities of the Diocese of Rockville Centre"],
  ["Catholic Charities Tompkins", "Catholic Charities of Tompkins and Tioga"],
  ["Chautauqua ARC Resource", "The Resource Center"],
  ["Chemlu", "Chemlu Developmental Disability Center"],
  ["Chemung-Schuyler County Chapter", "Chemung-Schuyler Counties Chapter NYSARC"],
  ["Community Mainstreaming", "Community Mainstreaming Associates"],
  ["Community Place and Greater Rochester", "The Community Place of Greater Rochester"],
  ["Community Programs of WJCS", "Community Programs of Westchester Jewish Community Services"],
  ["Community Residences Center", "Community Resource Center for the Developmentally Disabled"],
  ["Community Residences Services and Children", "Community Resources and Services for Children"],
  ["East End Disability", "East End Disability Associates"],
  ["East Harlem Council", "East Harlem Council for Community Improvement"],
  ["Eden II School", "Eden II School for Autistic Children"],
  ["Family Enrichment Network", "Family Enrichment Network"],
  ["Family and Child Services", "Family and Child Services of Schenectady"],
  ["Franziska Racker", "Franziska Racker Centers"],
  ["Guild ", "Guild for Exceptional Children"],
  ["Handicapped Child Southern", "The Handicapped Children's Association of Southern New York"],
  ["Health Association and Niagara", "Health Association of Niagara County"],
  ["Heart Share", "HeartShare Human Services of New York"],
  ["Heartshare Human Services", "HeartShare Human Services of New York"],
  ["Heartshare Wellness", "HeartShare Wellness"],
  ["Human Care Services", "Human Care Services for Families and Children"],
  ["Independent Group Home", "Independent Group Home Living Program"],
  ["Institute for Applied Human", "Institutes of Applied Human Dynamics"],
  ["Institute of Applied Human", "Institutes of Applied Human Dynamics"],
  ["Jefferson Rehab", "Jefferson Rehabilitation Center"],
  ["Jewish Board", "Jewish Board of Family and Children's Services"],
  ["Learning Disabilities Association Western", "Learning Disabilities Association of Western New York"],
  ["Learning Disabilities Western", "Learning Disabilities Association of Western New York"],
  ["Lifespire", "Lifespire"],
  ["Lifetime Assist", "Lifetime Assistance"],
  ["Little Flower", "Little Flower Children and Family Services"],
  ["Living Residences Corporation", "Living Resources Corporation"],
  ["Livingston Wyoming ARC", "Livingston-Wyoming County NYSARC"],
  ["Madison Cortland", "NYSARC Madison-Cortland Counties Chapter"],
  ["Madison-Cortland", "NYSARC Madison-Cortland Counties Chapter"],
  ["Mental Health Association of Nassau", "Mental Health Association of Nassau County"],
  ["Modern Guidance", "Modern Guidance Services"],
  ["Nassau Suffolk Services", "Nassau Suffolk Services for the Autistic"],
  ["Nassau and Suffolk Services", "Nassau Suffolk Services for the Autistic"],
  ["Nassau County Chapter Nysahrc", "Nassau County NYSARC"],
  ["New Horizon Resources", "New Horizons Resources"],
  ["NYSARC Cattaraug", "NYSARC Cattaraugus-Niagara County Chapter"],
  ["Bernard Fineson Developmental Disabilities", "Bernard M. Fineson Developmental Disabilities Services Office"],
  ["Bernard M Fineson", "Bernard M. Fineson Developmental Disabilities Services Office"],
  ["Bernard Fineson Developmental Center", "Bernard M. Fineson Developmental Center"],
  ["Craig Developmental Disabilities", "Craig Developmental Disabilities Services Office"],
  ["Everyoneny", "EveryoneNY"],
  ["Liberty NYSARC", "Liberty ARC"],
  ["Liberty and Montgomery", "Liberty ARC"],
  ["Ability Beyond", "Ability Beyond Disability"],
  ["=Pesach Tikvah", "Pesach Tikvah-Hope Development"],
  ["Disabled Persons Action", "Disabled Person's Action Organization"],
  ["=Finger Lakes Developmental Disabilities", "Finger Lakes Developmental Disabilities Services Office"],
  ["Center for Disabilities Services", "Center for Disability Services"],
  ["Camp Venture", "Camp Venture"],
  ["Orange County United Cerebral Palsy Association", "Orange County United Cerebral Palsy Association (Inspire)"],
  ["The Center for Discovery", "The Center for Discovery"],
  ["YAI and", "YAI – Young Adult Institute"],
  ["People Service", "People Incorporated"],
  ["Episcopal Mission", "Episcopal Mission Society"],
  ["Easter Seals", "Easter Seals New York"],
  ["Edwin Gould", "Edwin Gould Services for Children and Families"],
  ["United Helpers Care", "United Helpers"],
  ["Urban Resource Institute", "Urban Resource Institute"],
  ["Wassaic", "Wassaic Developmental Center"],
  ["West Seneca Developmental Center", "West Seneca Developmental Center"],
  ["Brooklyn Developmental Center", "Brooklyn Developmental Center"],
  ["Cardinal Hayes Home", "Cardinal Hayes Home for Children"],
  ["Community Resource Center", "Community Resource Center for the Developmentally Disabled"],
  ["Crystal Run", "Crystal Run Village"],
  ["Gan Kavod", "Gan Kavod"],
  ["North Star Industries", "North Star Industries"],
  ["Mental Health Association Orange", "Mental Health Association of Orange County"],
  ["=Cardinal Hayes Home", "Cardinal Hayes Home for Children"],
  ["Epilepsy Foundation Long Island", "Epilepsy Foundation of Long Island"],
  ["Jewish Family Services Buffalo", "Jewish Family Services of Buffalo and Erie County"],
  ["Niagara ARC", "Niagara ARC"],
  ["Ohel Children's", "Ohel Children's Home and Family Services"],
  ["Opengate", "Open Gate"],
  ["Partnership for Innovative", "Partnership for Innovative Comprehensive Care"],
  ["Pathways ", "Pathways"],
  ["Plus", "Plus Group Homes"],
  ["Program Development", "Program Development Services"],
  ["Provider Hamaspik Kings", "Hamaspik of Kings County"],
  ["Puerto Rican Family", "Puerto Rican Family Institute"],
  ["Resource Center-Independent", "Resource Center for Independent Living"],
  ["Rewarding Environments", "Rewarding Environments for Adult Living"],
  ["SDTC", "The Center for Discovery"],
  ["Center for Discovery", "The Center for Discovery"],
  ["Saint Christopher", "Saint Christopher-Ottilie"],
  ["Saint Dominics Home", "Saint Dominic's Home"],
  ["School for Language", "School for Language and Communication Development"],
  ["School of Language", "School for Language and Communication Development"],
  ["School of Holy Childhood", "The Rochester School of the Holy Childhood"],
  ["Services for T Undersvrd", "Services for the Underserved"],
  ["Services for the Developmental", "Services for the Developmentally Challenged"],
  ["Special Care for Families", "Special Care for Families and Children Services"],
  ["Special Citizens Future", "Special Citizens Futures Unlimited"],
  ["Suffolk County ARC", "NYSARC Suffolk Chapter"],
  ["Toomey Residen", "Toomey Residential and Community Services"],
  ["Ulster Green", "NYSARC Ulster Greene Putnam Counties Chapter"],
  ["Ulster-Greene ARC", "NYSARC Ulster Greene Putnam Counties Chapter"],
  ["United Cerebral Palsy Bayville", "United Cerebral Palsy Association of Nassau County"],
  ["United Cerebral Palsy Nassau", "United Cerebral Palsy Association of Nassau County"],
  ["United Cerebral Palsy Handicapped P", "United Cerebral Palsy and Handicapped Persons Association of the Utica Area"],
  ["United Cerebral Palsy New York City", "United Cerebral Palsy of New York City"],
  ["United Cerebral Palsy Niagara", "United Cerebral Palsy Association of Niagara County"],
  ["United Cerebral Palsy Association Niagara", "United Cerebral Palsy Association of Niagara County"],
  ["United Cerebral Palsy Putnam", "United Cerebral Palsy of Putnam and Southern Dutchess"],
  ["United Cerebral Palsy Ulster", "United Cerebral Palsy of Ulster County"],
  ["United Cerebral Palsy Association of the Tri", "United Cerebral Palsy of the Tri-Counties"],
  ["Welllife", "WellLife Network"],
  ["West Institute for Human", "Westchester Institute for Human Development"],
  ["Westchester NYSARC", "Westchester County NYSARC"],
  ["Womans League", "Women's League Community Residences"],
  ["Womens League", "Women's League Community Residences"],
  ["Wraparound Services", "Wraparound Services of the Hudson Valley"],
  ["=YAI", "YAI – Young Adult Institute"],
  ["=Young Adult Institute", "YAI – Young Adult Institute"],
  ["Yeled V", "Yeled V'Yalda Early Childhood Center"],
  ["Accesscny", "AccessCNY"],
  ["The ARC Jefferson", "The ARC Jefferson-Saint Lawrence New York"],
  ["Orleans County Chapter ARC", "Orleans County Chapter NYSARC"],
  ["Allegany County Chapter ARC", "Allegany County Chapter NYSARC"],
  ["=People", "People Incorporated"],
  ["=People Blue Rose", "People Incorporated"], ["=People Eggert Road", "People Incorporated"], ["=People Finger Lakes", "People Incorporated"],
  ["=People Main Street", "People Incorporated"], ["=People Orchard Park", "People Incorporated"], ["=People Service", "People Incorporated"],
  ["=People Waterford Park", "People Incorporated"],
  ["Devereux Foundation", "The Devereux Foundation"],
  ["Center for Developmental Disabilities", "Center for Developmental Disabilities"],
  ["Catholic Charities – Rockville", "Catholic Charities of the Diocese of Rockville Centre"],
  ["Catholic Charities Rockville", "Catholic Charities of the Diocese of Rockville Centre"],
];

/** One agency, one name: names known to mean the same agency (any provider type) get its full name. */
export function canonicalName(name: string): string {
  const exact = AGENCY_BY_START.find(([k]) => k.startsWith("=") && k.slice(1).toUpperCase() === name.toUpperCase());
  if (exact) return exact[1];
  const start = AGENCY_BY_START.find(([k]) => !k.startsWith("=") && name.toUpperCase().startsWith(k.toUpperCase()));
  return start ? start[1] : name;
}

// Street words: a site's street ("Browning Road") at the end of a name
const STREET_WORDS = new Set(["Street", "Avenue", "Road", "Drive", "Boulevard", "Lane", "Court", "Place", "Building", "Region"]);

/**
 * The agency part of a site's name: drops a site's street or number at the end ("Ohel Children's Home 52nd Street",
 * "Cardinal Hayes Home Browning Road", "West Seneca Developmental Center 540 Leydecker").
 */
export function agencyPart(name: string): string {
  let words = name.split(" ");
  const firstNumber = words.findIndex((w, i) => i >= 2 && /^\d|#/.test(w));
  if (firstNumber > 0) words = words.slice(0, firstNumber);
  if (words.length >= 4 && STREET_WORDS.has(words[words.length - 1])) words = words.slice(0, -2);
  else if (words.length >= 3 && words[words.length - 1] === "Apt") words = words.slice(0, -1);
  return words.join(" ").replace(/\s+(and|of|for|the|with|–)$/i, "");
}
