/**
 * Puttur Taluk Village Code to Village Name Lookup Table
 * Sourced directly from: Puttur_Village_Code_Name_Lookup_Complete.csv
 *
 * Maps LGD_VillageCode -> Village_Name
 * Supports all 67 villages in Puttur Taluk including:
 *   617686 -> Kabaka (Rural)
 *   938816 -> Putturu
 *
 * If a code has no match, returns 'Not Available'.
 */

export const VILLAGE_LOOKUP = {
  "617686": "Kabaka (Rural)",
  "617687": "Kudipadi",
  "617688": "Padnoor (Rural)",
  "617689": "Bannur (Rural)",
  "617690": "Kodimbady",
  "617691": "Chickamudnoor (Rural)",
  "617692": "Bellipadi",
  "617693": "Nekkiladi",
  "617694": "Hirebandadi",
  "617695": "Bajathuru",
  "617696": "G0Lithattu",
  "617697": "Alanthaya",
  "617698": "Konalu",
  "617699": "Nelyadi",
  "617700": "Kowkradi",
  "617701": "Ichlampady",
  "617702": "Konaje",
  "617703": "Shirady",
  "617704": "Shiribagilu",
  "617705": "Koila",
  "617706": "Ramakunja",
  "617707": "Haleneranki",
  "617708": "Perabe",
  "617709": "Kunthoor",
  "617710": "Ballya",
  "617711": "Noojibalthila",
  "617712": "Renjilady",
  "617713": "Kombaru",
  "617714": "Bilinele",
  "617715": "Bantra",
  "617716": "Kutrupadi",
  "617717": "Charvaka",
  "617718": "Kudmaru",
  "617719": "Alankaru",
  "617720": "Savanur",
  "617721": "Punachpady",
  "617722": "Palthadi",
  "617723": "Belandoor",
  "617724": "Kaimana",
  "617725": "Kaniyoor",
  "617726": "Dolpady",
  "617727": "Kadaba",
  "617728": "Kodimbala",
  "617729": "102 Nekkilady",
  "617730": "Aithoor",
  "617731": "Balnadu (Rural)",
  "617732": "Aryapu (Rural)",
  "617733": "Kuriya",
  "617734": "Kemminje (Rural)",
  "617735": "Narimogru",
  "617736": "Shanthigodu",
  "617737": "Sarve",
  "617738": "Mundoor",
  "617739": "Kedambady",
  "617740": "Olamogru",
  "617741": "Irde",
  "617742": "Panaje",
  "617743": "Bettampady",
  "617744": "Ariyadka",
  "617745": "Keyyur",
  "617746": "Madnooru",
  "617747": "Badagannur",
  "617748": "Nidpalli",
  "617749": "Paduvannur",
  "617750": "Nettanigemudnoor",
  "617751": "Kolthige",
  "938816": "Putturu",
  "617752": "Uppinangady",
  "617756": "Bellare",
  "617759": "Aivarnadu",
  "617761": "Kanaka Majalu",
  "617593": "Kula",
  "617596": "Punacha",
  "617669": "Ilanthila",
  "617671": "Mogru",
  "617672": "Bandaru",
  "617583": "Kedila",
  "617594": "Vittalmudnoor",
  "617581": "Biliyur",
  "617667": "Barya"
};

/**
 * Resolves the village name for a parcel given its LGD_VillageCode
 * (and optional existing village attribute).
 *
 * @param {string|number} lgdVillageCode - The LGD_VillageCode from parcel properties
 * @param {string} [existingVillageName] - Any existing village name attribute
 * @returns {string} The matched Village Name, or 'Not Available'
 */
export function getVillageName(lgdVillageCode, existingVillageName = null) {
  if (existingVillageName && existingVillageName !== 'Not Available' && existingVillageName !== 'None' && existingVillageName !== 'null') {
    return existingVillageName;
  }
  if (lgdVillageCode === undefined || lgdVillageCode === null) {
    return 'Not Available';
  }
  const cleanCode = String(lgdVillageCode).trim();
  if (!cleanCode || cleanCode.toLowerCase() === 'not available' || cleanCode.toLowerCase() === 'none') {
    return 'Not Available';
  }
  return VILLAGE_LOOKUP[cleanCode] || 'Not Available';
}

export default getVillageName;
