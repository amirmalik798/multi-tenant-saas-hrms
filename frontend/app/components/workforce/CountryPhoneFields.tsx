"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FocusEvent,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";

export type CountryOption = {
  code: string;
  name: string;
  callingCode: string;
};

export const COUNTRY_OPTIONS: CountryOption[] = [
  {
    "code": "AF",
    "name": "Afghanistan",
    "callingCode": "93"
  },
  {
    "code": "AL",
    "name": "Albania",
    "callingCode": "355"
  },
  {
    "code": "DZ",
    "name": "Algeria",
    "callingCode": "213"
  },
  {
    "code": "AS",
    "name": "American Samoa",
    "callingCode": "1684"
  },
  {
    "code": "AD",
    "name": "Andorra",
    "callingCode": "376"
  },
  {
    "code": "AO",
    "name": "Angola",
    "callingCode": "244"
  },
  {
    "code": "AI",
    "name": "Anguilla",
    "callingCode": "1264"
  },
  {
    "code": "AQ",
    "name": "Antarctica",
    "callingCode": "672"
  },
  {
    "code": "AG",
    "name": "Antigua and Barbuda",
    "callingCode": "1268"
  },
  {
    "code": "AR",
    "name": "Argentina",
    "callingCode": "54"
  },
  {
    "code": "AM",
    "name": "Armenia",
    "callingCode": "374"
  },
  {
    "code": "AW",
    "name": "Aruba",
    "callingCode": "297"
  },
  {
    "code": "AU",
    "name": "Australia",
    "callingCode": "61"
  },
  {
    "code": "AT",
    "name": "Austria",
    "callingCode": "43"
  },
  {
    "code": "AZ",
    "name": "Azerbaijan",
    "callingCode": "994"
  },
  {
    "code": "BS",
    "name": "Bahamas",
    "callingCode": "1242"
  },
  {
    "code": "BH",
    "name": "Bahrain",
    "callingCode": "973"
  },
  {
    "code": "BD",
    "name": "Bangladesh",
    "callingCode": "880"
  },
  {
    "code": "BB",
    "name": "Barbados",
    "callingCode": "1246"
  },
  {
    "code": "BY",
    "name": "Belarus",
    "callingCode": "375"
  },
  {
    "code": "BE",
    "name": "Belgium",
    "callingCode": "32"
  },
  {
    "code": "BZ",
    "name": "Belize",
    "callingCode": "501"
  },
  {
    "code": "BJ",
    "name": "Benin",
    "callingCode": "229"
  },
  {
    "code": "BM",
    "name": "Bermuda",
    "callingCode": "1441"
  },
  {
    "code": "BT",
    "name": "Bhutan",
    "callingCode": "975"
  },
  {
    "code": "BO",
    "name": "Bolivia",
    "callingCode": "591"
  },
  {
    "code": "BQ",
    "name": "Bonaire, Sint Eustatius and Saba",
    "callingCode": "599"
  },
  {
    "code": "BA",
    "name": "Bosnia and Herzegovina",
    "callingCode": "387"
  },
  {
    "code": "BW",
    "name": "Botswana",
    "callingCode": "267"
  },
  {
    "code": "BV",
    "name": "Bouvet Island",
    "callingCode": "47"
  },
  {
    "code": "BR",
    "name": "Brazil",
    "callingCode": "55"
  },
  {
    "code": "IO",
    "name": "British Indian Ocean Territory",
    "callingCode": "246"
  },
  {
    "code": "BN",
    "name": "Brunei",
    "callingCode": "673"
  },
  {
    "code": "BG",
    "name": "Bulgaria",
    "callingCode": "359"
  },
  {
    "code": "BF",
    "name": "Burkina Faso",
    "callingCode": "226"
  },
  {
    "code": "BI",
    "name": "Burundi",
    "callingCode": "257"
  },
  {
    "code": "KH",
    "name": "Cambodia",
    "callingCode": "855"
  },
  {
    "code": "CM",
    "name": "Cameroon",
    "callingCode": "237"
  },
  {
    "code": "CA",
    "name": "Canada",
    "callingCode": "1"
  },
  {
    "code": "CV",
    "name": "Cape Verde",
    "callingCode": "238"
  },
  {
    "code": "KY",
    "name": "Cayman Islands",
    "callingCode": "1345"
  },
  {
    "code": "CF",
    "name": "Central African Republic",
    "callingCode": "236"
  },
  {
    "code": "TD",
    "name": "Chad",
    "callingCode": "235"
  },
  {
    "code": "CL",
    "name": "Chile",
    "callingCode": "56"
  },
  {
    "code": "CN",
    "name": "China",
    "callingCode": "86"
  },
  {
    "code": "CX",
    "name": "Christmas Island",
    "callingCode": "61"
  },
  {
    "code": "CC",
    "name": "Cocos (Keeling) Islands",
    "callingCode": "61"
  },
  {
    "code": "CO",
    "name": "Colombia",
    "callingCode": "57"
  },
  {
    "code": "KM",
    "name": "Comoros",
    "callingCode": "269"
  },
  {
    "code": "CD",
    "name": "Congo (Democratic Republic)",
    "callingCode": "243"
  },
  {
    "code": "CG",
    "name": "Congo (Republic)",
    "callingCode": "242"
  },
  {
    "code": "CK",
    "name": "Cook Islands",
    "callingCode": "682"
  },
  {
    "code": "CR",
    "name": "Costa Rica",
    "callingCode": "506"
  },
  {
    "code": "HR",
    "name": "Croatia",
    "callingCode": "385"
  },
  {
    "code": "CU",
    "name": "Cuba",
    "callingCode": "53"
  },
  {
    "code": "CW",
    "name": "Curaçao",
    "callingCode": "599"
  },
  {
    "code": "CY",
    "name": "Cyprus",
    "callingCode": "357"
  },
  {
    "code": "CZ",
    "name": "Czechia",
    "callingCode": "420"
  },
  {
    "code": "CI",
    "name": "Côte d’Ivoire",
    "callingCode": "225"
  },
  {
    "code": "DK",
    "name": "Denmark",
    "callingCode": "45"
  },
  {
    "code": "DJ",
    "name": "Djibouti",
    "callingCode": "253"
  },
  {
    "code": "DM",
    "name": "Dominica",
    "callingCode": "1767"
  },
  {
    "code": "DO",
    "name": "Dominican Republic",
    "callingCode": "1809"
  },
  {
    "code": "EC",
    "name": "Ecuador",
    "callingCode": "593"
  },
  {
    "code": "EG",
    "name": "Egypt",
    "callingCode": "20"
  },
  {
    "code": "SV",
    "name": "El Salvador",
    "callingCode": "503"
  },
  {
    "code": "GQ",
    "name": "Equatorial Guinea",
    "callingCode": "240"
  },
  {
    "code": "ER",
    "name": "Eritrea",
    "callingCode": "291"
  },
  {
    "code": "EE",
    "name": "Estonia",
    "callingCode": "372"
  },
  {
    "code": "SZ",
    "name": "Eswatini",
    "callingCode": "268"
  },
  {
    "code": "ET",
    "name": "Ethiopia",
    "callingCode": "251"
  },
  {
    "code": "FK",
    "name": "Falkland Islands (Malvinas)",
    "callingCode": "500"
  },
  {
    "code": "FO",
    "name": "Faroe Islands",
    "callingCode": "298"
  },
  {
    "code": "FJ",
    "name": "Fiji",
    "callingCode": "679"
  },
  {
    "code": "FI",
    "name": "Finland",
    "callingCode": "358"
  },
  {
    "code": "FR",
    "name": "France",
    "callingCode": "33"
  },
  {
    "code": "GF",
    "name": "French Guiana",
    "callingCode": "594"
  },
  {
    "code": "PF",
    "name": "French Polynesia",
    "callingCode": "689"
  },
  {
    "code": "TF",
    "name": "French Southern Territories",
    "callingCode": "262"
  },
  {
    "code": "GA",
    "name": "Gabon",
    "callingCode": "241"
  },
  {
    "code": "GM",
    "name": "Gambia",
    "callingCode": "220"
  },
  {
    "code": "GE",
    "name": "Georgia",
    "callingCode": "995"
  },
  {
    "code": "DE",
    "name": "Germany",
    "callingCode": "49"
  },
  {
    "code": "GH",
    "name": "Ghana",
    "callingCode": "233"
  },
  {
    "code": "GI",
    "name": "Gibraltar",
    "callingCode": "350"
  },
  {
    "code": "GR",
    "name": "Greece",
    "callingCode": "30"
  },
  {
    "code": "GL",
    "name": "Greenland",
    "callingCode": "299"
  },
  {
    "code": "GD",
    "name": "Grenada",
    "callingCode": "1473"
  },
  {
    "code": "GP",
    "name": "Guadeloupe",
    "callingCode": "590"
  },
  {
    "code": "GU",
    "name": "Guam",
    "callingCode": "1671"
  },
  {
    "code": "GT",
    "name": "Guatemala",
    "callingCode": "502"
  },
  {
    "code": "GG",
    "name": "Guernsey",
    "callingCode": "44"
  },
  {
    "code": "GN",
    "name": "Guinea",
    "callingCode": "224"
  },
  {
    "code": "GW",
    "name": "Guinea-Bissau",
    "callingCode": "245"
  },
  {
    "code": "GY",
    "name": "Guyana",
    "callingCode": "592"
  },
  {
    "code": "HT",
    "name": "Haiti",
    "callingCode": "509"
  },
  {
    "code": "HM",
    "name": "Heard Island and McDonald Islands",
    "callingCode": "672"
  },
  {
    "code": "HN",
    "name": "Honduras",
    "callingCode": "504"
  },
  {
    "code": "HK",
    "name": "Hong Kong",
    "callingCode": "852"
  },
  {
    "code": "HU",
    "name": "Hungary",
    "callingCode": "36"
  },
  {
    "code": "IS",
    "name": "Iceland",
    "callingCode": "354"
  },
  {
    "code": "IN",
    "name": "India",
    "callingCode": "91"
  },
  {
    "code": "ID",
    "name": "Indonesia",
    "callingCode": "62"
  },
  {
    "code": "IR",
    "name": "Iran",
    "callingCode": "98"
  },
  {
    "code": "IQ",
    "name": "Iraq",
    "callingCode": "964"
  },
  {
    "code": "IE",
    "name": "Ireland",
    "callingCode": "353"
  },
  {
    "code": "IM",
    "name": "Isle of Man",
    "callingCode": "44"
  },
  {
    "code": "IL",
    "name": "Israel",
    "callingCode": "972"
  },
  {
    "code": "IT",
    "name": "Italy",
    "callingCode": "39"
  },
  {
    "code": "JM",
    "name": "Jamaica",
    "callingCode": "1876"
  },
  {
    "code": "JP",
    "name": "Japan",
    "callingCode": "81"
  },
  {
    "code": "JE",
    "name": "Jersey",
    "callingCode": "44"
  },
  {
    "code": "JO",
    "name": "Jordan",
    "callingCode": "962"
  },
  {
    "code": "KZ",
    "name": "Kazakhstan",
    "callingCode": "7"
  },
  {
    "code": "KE",
    "name": "Kenya",
    "callingCode": "254"
  },
  {
    "code": "KI",
    "name": "Kiribati",
    "callingCode": "686"
  },
  {
    "code": "XK",
    "name": "Kosovo",
    "callingCode": "383"
  },
  {
    "code": "KW",
    "name": "Kuwait",
    "callingCode": "965"
  },
  {
    "code": "KG",
    "name": "Kyrgyzstan",
    "callingCode": "996"
  },
  {
    "code": "LA",
    "name": "Laos",
    "callingCode": "856"
  },
  {
    "code": "LV",
    "name": "Latvia",
    "callingCode": "371"
  },
  {
    "code": "LB",
    "name": "Lebanon",
    "callingCode": "961"
  },
  {
    "code": "LS",
    "name": "Lesotho",
    "callingCode": "266"
  },
  {
    "code": "LR",
    "name": "Liberia",
    "callingCode": "231"
  },
  {
    "code": "LY",
    "name": "Libya",
    "callingCode": "218"
  },
  {
    "code": "LI",
    "name": "Liechtenstein",
    "callingCode": "423"
  },
  {
    "code": "LT",
    "name": "Lithuania",
    "callingCode": "370"
  },
  {
    "code": "LU",
    "name": "Luxembourg",
    "callingCode": "352"
  },
  {
    "code": "MO",
    "name": "Macao",
    "callingCode": "853"
  },
  {
    "code": "MG",
    "name": "Madagascar",
    "callingCode": "261"
  },
  {
    "code": "MW",
    "name": "Malawi",
    "callingCode": "265"
  },
  {
    "code": "MY",
    "name": "Malaysia",
    "callingCode": "60"
  },
  {
    "code": "MV",
    "name": "Maldives",
    "callingCode": "960"
  },
  {
    "code": "ML",
    "name": "Mali",
    "callingCode": "223"
  },
  {
    "code": "MT",
    "name": "Malta",
    "callingCode": "356"
  },
  {
    "code": "MH",
    "name": "Marshall Islands",
    "callingCode": "692"
  },
  {
    "code": "MQ",
    "name": "Martinique",
    "callingCode": "596"
  },
  {
    "code": "MR",
    "name": "Mauritania",
    "callingCode": "222"
  },
  {
    "code": "MU",
    "name": "Mauritius",
    "callingCode": "230"
  },
  {
    "code": "YT",
    "name": "Mayotte",
    "callingCode": "262"
  },
  {
    "code": "MX",
    "name": "Mexico",
    "callingCode": "52"
  },
  {
    "code": "FM",
    "name": "Micronesia",
    "callingCode": "691"
  },
  {
    "code": "MD",
    "name": "Moldova",
    "callingCode": "373"
  },
  {
    "code": "MC",
    "name": "Monaco",
    "callingCode": "377"
  },
  {
    "code": "MN",
    "name": "Mongolia",
    "callingCode": "976"
  },
  {
    "code": "ME",
    "name": "Montenegro",
    "callingCode": "382"
  },
  {
    "code": "MS",
    "name": "Montserrat",
    "callingCode": "1664"
  },
  {
    "code": "MA",
    "name": "Morocco",
    "callingCode": "212"
  },
  {
    "code": "MZ",
    "name": "Mozambique",
    "callingCode": "258"
  },
  {
    "code": "MM",
    "name": "Myanmar",
    "callingCode": "95"
  },
  {
    "code": "NA",
    "name": "Namibia",
    "callingCode": "264"
  },
  {
    "code": "NR",
    "name": "Nauru",
    "callingCode": "674"
  },
  {
    "code": "NP",
    "name": "Nepal",
    "callingCode": "977"
  },
  {
    "code": "NL",
    "name": "Netherlands",
    "callingCode": "31"
  },
  {
    "code": "NC",
    "name": "New Caledonia",
    "callingCode": "687"
  },
  {
    "code": "NZ",
    "name": "New Zealand",
    "callingCode": "64"
  },
  {
    "code": "NI",
    "name": "Nicaragua",
    "callingCode": "505"
  },
  {
    "code": "NE",
    "name": "Niger",
    "callingCode": "227"
  },
  {
    "code": "NG",
    "name": "Nigeria",
    "callingCode": "234"
  },
  {
    "code": "NU",
    "name": "Niue",
    "callingCode": "683"
  },
  {
    "code": "NF",
    "name": "Norfolk Island",
    "callingCode": "672"
  },
  {
    "code": "KP",
    "name": "North Korea",
    "callingCode": "850"
  },
  {
    "code": "MK",
    "name": "North Macedonia",
    "callingCode": "389"
  },
  {
    "code": "MP",
    "name": "Northern Mariana Islands",
    "callingCode": "1670"
  },
  {
    "code": "NO",
    "name": "Norway",
    "callingCode": "47"
  },
  {
    "code": "OM",
    "name": "Oman",
    "callingCode": "968"
  },
  {
    "code": "PK",
    "name": "Pakistan",
    "callingCode": "92"
  },
  {
    "code": "PW",
    "name": "Palau",
    "callingCode": "680"
  },
  {
    "code": "PS",
    "name": "Palestine",
    "callingCode": "970"
  },
  {
    "code": "PA",
    "name": "Panama",
    "callingCode": "507"
  },
  {
    "code": "PG",
    "name": "Papua New Guinea",
    "callingCode": "675"
  },
  {
    "code": "PY",
    "name": "Paraguay",
    "callingCode": "595"
  },
  {
    "code": "PE",
    "name": "Peru",
    "callingCode": "51"
  },
  {
    "code": "PH",
    "name": "Philippines",
    "callingCode": "63"
  },
  {
    "code": "PN",
    "name": "Pitcairn",
    "callingCode": "64"
  },
  {
    "code": "PL",
    "name": "Poland",
    "callingCode": "48"
  },
  {
    "code": "PT",
    "name": "Portugal",
    "callingCode": "351"
  },
  {
    "code": "PR",
    "name": "Puerto Rico",
    "callingCode": "1787"
  },
  {
    "code": "QA",
    "name": "Qatar",
    "callingCode": "974"
  },
  {
    "code": "RO",
    "name": "Romania",
    "callingCode": "40"
  },
  {
    "code": "RU",
    "name": "Russia",
    "callingCode": "7"
  },
  {
    "code": "RW",
    "name": "Rwanda",
    "callingCode": "250"
  },
  {
    "code": "RE",
    "name": "Réunion",
    "callingCode": "262"
  },
  {
    "code": "BL",
    "name": "Saint Barthélemy",
    "callingCode": "590"
  },
  {
    "code": "SH",
    "name": "Saint Helena, Ascension and Tristan da Cunha",
    "callingCode": "290"
  },
  {
    "code": "KN",
    "name": "Saint Kitts and Nevis",
    "callingCode": "1869"
  },
  {
    "code": "LC",
    "name": "Saint Lucia",
    "callingCode": "1758"
  },
  {
    "code": "MF",
    "name": "Saint Martin (French part)",
    "callingCode": "590"
  },
  {
    "code": "PM",
    "name": "Saint Pierre and Miquelon",
    "callingCode": "508"
  },
  {
    "code": "VC",
    "name": "Saint Vincent and the Grenadines",
    "callingCode": "1784"
  },
  {
    "code": "WS",
    "name": "Samoa",
    "callingCode": "685"
  },
  {
    "code": "SM",
    "name": "San Marino",
    "callingCode": "378"
  },
  {
    "code": "ST",
    "name": "Sao Tome and Principe",
    "callingCode": "239"
  },
  {
    "code": "SA",
    "name": "Saudi Arabia",
    "callingCode": "966"
  },
  {
    "code": "SN",
    "name": "Senegal",
    "callingCode": "221"
  },
  {
    "code": "RS",
    "name": "Serbia",
    "callingCode": "381"
  },
  {
    "code": "SC",
    "name": "Seychelles",
    "callingCode": "248"
  },
  {
    "code": "SL",
    "name": "Sierra Leone",
    "callingCode": "232"
  },
  {
    "code": "SG",
    "name": "Singapore",
    "callingCode": "65"
  },
  {
    "code": "SX",
    "name": "Sint Maarten (Dutch part)",
    "callingCode": "1721"
  },
  {
    "code": "SK",
    "name": "Slovakia",
    "callingCode": "421"
  },
  {
    "code": "SI",
    "name": "Slovenia",
    "callingCode": "386"
  },
  {
    "code": "SB",
    "name": "Solomon Islands",
    "callingCode": "677"
  },
  {
    "code": "SO",
    "name": "Somalia",
    "callingCode": "252"
  },
  {
    "code": "ZA",
    "name": "South Africa",
    "callingCode": "27"
  },
  {
    "code": "GS",
    "name": "South Georgia and the South Sandwich Islands",
    "callingCode": "500"
  },
  {
    "code": "KR",
    "name": "South Korea",
    "callingCode": "82"
  },
  {
    "code": "SS",
    "name": "South Sudan",
    "callingCode": "211"
  },
  {
    "code": "ES",
    "name": "Spain",
    "callingCode": "34"
  },
  {
    "code": "LK",
    "name": "Sri Lanka",
    "callingCode": "94"
  },
  {
    "code": "SD",
    "name": "Sudan",
    "callingCode": "249"
  },
  {
    "code": "SR",
    "name": "Suriname",
    "callingCode": "597"
  },
  {
    "code": "SJ",
    "name": "Svalbard and Jan Mayen",
    "callingCode": "47"
  },
  {
    "code": "SE",
    "name": "Sweden",
    "callingCode": "46"
  },
  {
    "code": "CH",
    "name": "Switzerland",
    "callingCode": "41"
  },
  {
    "code": "SY",
    "name": "Syria",
    "callingCode": "963"
  },
  {
    "code": "TW",
    "name": "Taiwan",
    "callingCode": "886"
  },
  {
    "code": "TJ",
    "name": "Tajikistan",
    "callingCode": "992"
  },
  {
    "code": "TZ",
    "name": "Tanzania",
    "callingCode": "255"
  },
  {
    "code": "TH",
    "name": "Thailand",
    "callingCode": "66"
  },
  {
    "code": "TL",
    "name": "Timor-Leste",
    "callingCode": "670"
  },
  {
    "code": "TG",
    "name": "Togo",
    "callingCode": "228"
  },
  {
    "code": "TK",
    "name": "Tokelau",
    "callingCode": "690"
  },
  {
    "code": "TO",
    "name": "Tonga",
    "callingCode": "676"
  },
  {
    "code": "TT",
    "name": "Trinidad and Tobago",
    "callingCode": "1868"
  },
  {
    "code": "TN",
    "name": "Tunisia",
    "callingCode": "216"
  },
  {
    "code": "TM",
    "name": "Turkmenistan",
    "callingCode": "993"
  },
  {
    "code": "TC",
    "name": "Turks and Caicos Islands",
    "callingCode": "1649"
  },
  {
    "code": "TV",
    "name": "Tuvalu",
    "callingCode": "688"
  },
  {
    "code": "TR",
    "name": "Türkiye",
    "callingCode": "90"
  },
  {
    "code": "UG",
    "name": "Uganda",
    "callingCode": "256"
  },
  {
    "code": "UA",
    "name": "Ukraine",
    "callingCode": "380"
  },
  {
    "code": "AE",
    "name": "United Arab Emirates",
    "callingCode": "971"
  },
  {
    "code": "GB",
    "name": "United Kingdom",
    "callingCode": "44"
  },
  {
    "code": "US",
    "name": "United States",
    "callingCode": "1"
  },
  {
    "code": "UM",
    "name": "United States Minor Outlying Islands",
    "callingCode": "1"
  },
  {
    "code": "UY",
    "name": "Uruguay",
    "callingCode": "598"
  },
  {
    "code": "UZ",
    "name": "Uzbekistan",
    "callingCode": "998"
  },
  {
    "code": "VU",
    "name": "Vanuatu",
    "callingCode": "678"
  },
  {
    "code": "VA",
    "name": "Vatican City",
    "callingCode": "39"
  },
  {
    "code": "VE",
    "name": "Venezuela",
    "callingCode": "58"
  },
  {
    "code": "VN",
    "name": "Viet Nam",
    "callingCode": "84"
  },
  {
    "code": "VG",
    "name": "Virgin Islands, British",
    "callingCode": "1284"
  },
  {
    "code": "VI",
    "name": "Virgin Islands, U.S.",
    "callingCode": "1340"
  },
  {
    "code": "WF",
    "name": "Wallis and Futuna",
    "callingCode": "681"
  },
  {
    "code": "EH",
    "name": "Western Sahara",
    "callingCode": "212"
  },
  {
    "code": "YE",
    "name": "Yemen",
    "callingCode": "967"
  },
  {
    "code": "ZM",
    "name": "Zambia",
    "callingCode": "260"
  },
  {
    "code": "ZW",
    "name": "Zimbabwe",
    "callingCode": "263"
  },
  {
    "code": "AX",
    "name": "Åland Islands",
    "callingCode": "358"
  }
];

const COUNTRY_BY_CODE = new Map(COUNTRY_OPTIONS.map((country) => [country.code, country]));
const COUNTRY_BY_NAME = new Map(COUNTRY_OPTIONS.map((country) => [country.name.trim().toLocaleLowerCase(), country]));
const COUNTRY_ALIASES: Record<string, string> = {
  "united states of america": "US",
  "usa": "US",
  "uk": "GB",
  "great britain": "GB",
  "republic of korea": "KR",
  "korea, republic of": "KR",
  "democratic people's republic of korea": "KP",
  "korea, democratic people's republic of": "KP",
  "iran, islamic republic of": "IR",
  "syrian arab republic": "SY",
  "russian federation": "RU",
  "viet nam": "VN",
  "lao people's democratic republic": "LA",
  "bolivia, plurinational state of": "BO",
  "venezuela, bolivarian republic of": "VE",
  "moldova, republic of": "MD",
  "tanzania, united republic of": "TZ",
  "palestinian territories": "PS",
  "state of palestine": "PS",
  "czech republic": "CZ",
  "swaziland": "SZ",
  "ivory coast": "CI",
  "cape verde islands": "CV",
  "brunei darussalam": "BN",
  "macedonia": "MK",
  "congo, democratic republic of the": "CD",
  "democratic republic of the congo": "CD",
  "congo, republic of the": "CG",
  "republic of the congo": "CG",
  "micronesia, federated states of": "FM",
  "vatican": "VA",
};

export function countryOption(value: string | null | undefined): CountryOption | null {
  const input = (value ?? "").trim();
  if (!input) return null;
  const upper = input.toUpperCase();
  if (COUNTRY_BY_CODE.has(upper)) return COUNTRY_BY_CODE.get(upper) ?? null;
  const byName = COUNTRY_BY_NAME.get(input.toLocaleLowerCase());
  if (byName) return byName;
  const aliasCode = COUNTRY_ALIASES[input.toLocaleLowerCase()];
  return aliasCode ? COUNTRY_BY_CODE.get(aliasCode) ?? null : null;
}

export function getCountryCallingCode(value: string | null | undefined): string {
  const country = countryOption(value);
  return country?.callingCode ? `+${country.callingCode}` : "";
}

export function isCallingCodeOnly(phone: string | null | undefined, country: string | null | undefined): boolean {
  const rawDigits = (phone ?? "").replace(/\D/g, "");
  const callingDigits = getCountryCallingCode(country).replace(/\D/g, "");
  return Boolean(rawDigits && callingDigits && rawDigits === callingDigits);
}

export function formatCountryWithFlag(value: string | null | undefined): string {
  const country = countryOption(value);
  if (!country) return (value ?? "").trim() || "Not provided";
  const flag = country.code === "XK"
    ? "🇽🇰"
    : [...country.code].map((character) => String.fromCodePoint(127397 + character.charCodeAt(0))).join("");
  return `${flag} ${country.name}`;
}

/**
 * Update the international prefix when country selection changes while
 * preserving the subscriber portion of a previously country-prefixed value.
 * Existing explicitly international numbers are left alone if the prior
 * country prefix cannot be identified, avoiding destructive guesses.
 */
export function replacePhoneCountryCode(
  phone: string,
  previousCountry: string | null | undefined,
  nextCountry: string | null | undefined,
): string {
  const nextCallingCode = getCountryCallingCode(nextCountry);
  const previousCallingCode = getCountryCallingCode(previousCountry);
  const value = phone.trim();
  if (!nextCallingCode) return value;
  if (!value) return `${nextCallingCode} `;
  if (!value.startsWith("+")) return `${nextCallingCode} ${value.replace(/^[\s().-]+/, "")}`;
  if (previousCallingCode && value.startsWith(previousCallingCode)) {
    const subscriberPart = value.slice(previousCallingCode.length).trimStart();
    return subscriberPart ? `${nextCallingCode} ${subscriberPart}` : `${nextCallingCode} `;
  }
  return value;
}

export function flagForCountry(value: string | null | undefined): string {
  const country = countryOption(value);
  if (!country) return "";
  return country.code === "XK"
    ? "🇽🇰"
    : [...country.code].map((character) => String.fromCodePoint(127397 + character.charCodeAt(0))).join("");
}

function CountryFlag({
  country,
  size = "md",
}: {
  country: CountryOption;
  size?: "sm" | "md";
}) {
  const [failed, setFailed] = useState(false);
  const dimensions = size === "sm" ? "h-[14px] w-[20px]" : "h-[18px] w-[26px]";

  useEffect(() => {
    setFailed(false);
  }, [country.code]);

  if (failed) {
    return (
      <span
        aria-hidden="true"
        className={`inline-flex ${dimensions} shrink-0 items-center justify-center rounded-[3px] border border-white/15 bg-slate-700 text-[8px] font-extrabold tracking-tight text-white`}
      >
        {country.code}
      </span>
    );
  }

  return (
    <img
      src={`https://flagcdn.com/w40/${country.code.toLowerCase()}.png`}
      alt=""
      aria-hidden="true"
      width={size === "sm" ? 20 : 26}
      height={size === "sm" ? 14 : 18}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={`${dimensions} shrink-0 rounded-[3px] border border-black/10 object-cover shadow-sm`}
    />
  );
}

type CountrySelectValueFormat = "name" | "code";

type CountrySelectPosition = {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
};

function normalizeCountrySearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase();
}

export function CountrySelect({
  id,
  value,
  onChange,
  onBlur,
  className,
  required = false,
  disabled = false,
  invalid = false,
  describedBy,
  valueFormat = "name",
  placeholder = "Select or search a country…",
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: (event: FocusEvent<HTMLInputElement>) => void;
  className: string;
  required?: boolean;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
  /** Use "code" for fields whose existing API contract stores ISO-3166 alpha-2 values. */
  valueFormat?: CountrySelectValueFormat;
  placeholder?: string;
}) {
  const selectedCountry = countryOption(value);
  const selectedLabel = selectedCountry?.name ?? value;
  // Preserve the exact stored value until the employee explicitly selects a
  // different country. This protects legacy aliases/codes from being silently
  // normalized just because another field on the form was saved.
  const selectedValue = value;

  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [portalReady, setPortalReady] = useState(false);
  const [editingText, setEditingText] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [position, setPosition] = useState<CountrySelectPosition | null>(null);
  const positionRef = useRef<CountrySelectPosition | null>(null);
  const generatedId = useId().replace(/:/g, "");
  const popupId = `${generatedId}-country-listbox`;
  const searchQuery = editingText ?? "";
  const inputValue = editingText ?? selectedLabel;

  useEffect(() => {
    setPortalReady(true);
  }, []);

  // Keep native required-field validation intact. Typing is only a search;
  // the employee must choose a result before the field becomes valid again.
  useEffect(() => {
    inputRef.current?.setCustomValidity(
      required && editingText !== null ? "Choose a country from the results list." : "",
    );
  }, [required, editingText]);

  const filteredCountries = useMemo(() => {
    const normalizedQuery = normalizeCountrySearch(searchQuery);
    if (!normalizedQuery) return COUNTRY_OPTIONS;

    const digits = normalizedQuery.replace(/^\+/, "").replace(/\D/g, "");
    const aliasCode = COUNTRY_ALIASES[normalizedQuery];

    // Two-letter input is treated as an ISO code/known alias first. This
    // avoids unrelated name substring matches (for example RW matching Norway).
    if (/^[a-z]{2}$/.test(normalizedQuery)) {
      const exactCodeMatch = COUNTRY_OPTIONS.find(
        (country) => country.code.toLocaleLowerCase() === normalizedQuery || country.code === aliasCode,
      );
      if (exactCodeMatch) return [exactCodeMatch];
    }

    return COUNTRY_OPTIONS.filter((country) => {
      const name = normalizeCountrySearch(country.name);
      const code = country.code.toLocaleLowerCase();
      const callingCode = country.callingCode.replace(/\D/g, "");
      return (
        name.includes(normalizedQuery) ||
        code === normalizedQuery ||
        code.includes(normalizedQuery) ||
        (aliasCode !== undefined && country.code === aliasCode) ||
        (digits.length > 0 && callingCode.startsWith(digits))
      );
    });
  }, [searchQuery]);

  const updatePopupPosition = useCallback(() => {
    const anchor = inputRef.current;
    if (!anchor || typeof window === "undefined") return;

    const rect = anchor.getBoundingClientRect();
    const viewportPadding = 8;
    // Keep the results list visually attached to the field; a visible gap can
    // look like the search results belong to a different form control.
    const anchorGap = 0;
    const availableBelow = Math.max(0, window.innerHeight - rect.bottom - viewportPadding - anchorGap);
    const availableAbove = Math.max(0, rect.top - viewportPadding - anchorGap);
    const placeAbove = availableBelow < 220 && availableAbove > availableBelow;
    const available = placeAbove ? availableAbove : availableBelow;
    const maxHeight = Math.max(180, Math.min(320, available || 320));
    const width = Math.min(rect.width, window.innerWidth - viewportPadding * 2);
    const left = Math.max(
      viewportPadding,
      Math.min(rect.left, window.innerWidth - width - viewportPadding),
    );
    const top = placeAbove
      ? Math.max(viewportPadding, rect.top - maxHeight - anchorGap)
      : rect.bottom + anchorGap;

    // Avoid rerendering the whole selector on every animation frame when the
    // anchor is moving sub-pixel amounts. A one-pixel tolerance is visually
    // imperceptible and keeps the drawer responsive while we follow its motion.
    const nextPosition = {
      top: Math.round(top),
      left: Math.round(left),
      width: Math.round(width),
      maxHeight: Math.round(maxHeight),
    };
    const currentPosition = positionRef.current;
    if (
      currentPosition &&
      currentPosition.top === nextPosition.top &&
      currentPosition.left === nextPosition.left &&
      currentPosition.width === nextPosition.width &&
      currentPosition.maxHeight === nextPosition.maxHeight
    ) {
      return;
    }

    positionRef.current = nextPosition;
    setPosition(nextPosition);
  }, []);

  useLayoutEffect(() => {
    if (!isOpen || !portalReady) return;

    const anchor = inputRef.current;
    if (!anchor) return;

    let motionFrame = 0;
    let disposed = false;
    const anchorAncestors = new Set<Element>();
    let ancestor: HTMLElement | null = anchor;
    while (ancestor && ancestor !== document.body && ancestor !== document.documentElement) {
      anchorAncestors.add(ancestor);
      ancestor = ancestor.parentElement;
    }

    const handleViewportChange = () => updatePopupPosition();
    const eventAffectsAnchor = (event: Event) =>
      event.target instanceof Element && anchorAncestors.has(event.target);

    // Only sample layout while an ancestor of the input is actively animating.
    // A portalled, fixed-position list cannot follow a CSS transform by itself,
    // but it does not need a permanent 60fps loop while the drawer is idle.
    const hasActiveAnchorAnimation = () => {
      if (typeof document.getAnimations !== "function") return false;
      return document.getAnimations().some((animation) => {
        const target = (animation.effect as KeyframeEffect | null)?.target;
        if (!(target instanceof Element) || !anchorAncestors.has(target)) return false;
        return animation.pending || animation.playState === "running";
      });
    };

    const stopMotionTracking = () => {
      if (motionFrame) window.cancelAnimationFrame(motionFrame);
      motionFrame = 0;
    };

    const trackDuringMotion = () => {
      if (disposed || motionFrame) return;
      const tick = () => {
        motionFrame = 0;
        if (disposed) return;
        updatePopupPosition();
        if (hasActiveAnchorAnimation()) {
          motionFrame = window.requestAnimationFrame(tick);
        }
      };
      motionFrame = window.requestAnimationFrame(tick);
    };

    const handleMotionStart = (event: Event) => {
      if (!eventAffectsAnchor(event)) return;
      trackDuringMotion();
    };

    const handleMotionEnd = (event: Event) => {
      if (!eventAffectsAnchor(event)) return;
      // transitionend/animationend fire after the final computed frame, so a
      // synchronous measurement is enough. Continue only if another relevant
      // animation on the drawer is still active.
      updatePopupPosition();
      if (hasActiveAnchorAnimation()) trackDuringMotion();
      else stopMotionTracking();
    };

    updatePopupPosition();

    // The drawer may already be animating by the time this effect is attached.
    if (hasActiveAnchorAnimation()) trackDuringMotion();

    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);
    window.visualViewport?.addEventListener("resize", handleViewportChange);
    window.visualViewport?.addEventListener("scroll", handleViewportChange);

    // Capture both CSS transitions and keyframe animations on the drawer or
    // any ancestor containing the country field. Frame tracking starts only
    // for those active motions, and ends on finish/cancel.
    document.addEventListener("transitionrun", handleMotionStart, true);
    document.addEventListener("transitionstart", handleMotionStart, true);
    document.addEventListener("animationstart", handleMotionStart, true);
    document.addEventListener("transitionend", handleMotionEnd, true);
    document.addEventListener("transitioncancel", handleMotionEnd, true);
    document.addEventListener("animationend", handleMotionEnd, true);
    document.addEventListener("animationcancel", handleMotionEnd, true);

    const resizeObserver = typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(handleViewportChange)
      : null;
    resizeObserver?.observe(anchor);

    // Observe the containing form/drawer elements. This catches responsive
    // width changes and validation messages without polling their geometry.
    let observedAncestor = anchor.parentElement;
    while (observedAncestor && observedAncestor !== document.body) {
      resizeObserver?.observe(observedAncestor);
      observedAncestor = observedAncestor.parentElement;
    }

    return () => {
      disposed = true;
      stopMotionTracking();
      resizeObserver?.disconnect();
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
      window.visualViewport?.removeEventListener("resize", handleViewportChange);
      window.visualViewport?.removeEventListener("scroll", handleViewportChange);
      document.removeEventListener("transitionrun", handleMotionStart, true);
      document.removeEventListener("transitionstart", handleMotionStart, true);
      document.removeEventListener("animationstart", handleMotionStart, true);
      document.removeEventListener("transitionend", handleMotionEnd, true);
      document.removeEventListener("transitioncancel", handleMotionEnd, true);
      document.removeEventListener("animationend", handleMotionEnd, true);
      document.removeEventListener("animationcancel", handleMotionEnd, true);
    };
  }, [isOpen, portalReady, updatePopupPosition]);

  useEffect(() => {
    if (!isOpen) return;

    const handleOutsidePointer = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (rootRef.current?.contains(target) || popupRef.current?.contains(target)) return;

      setIsOpen(false);
      setEditingText(null);
      positionRef.current = null;
      setPosition(null);
      inputRef.current?.blur();
    };

    document.addEventListener("pointerdown", handleOutsidePointer, true);
    return () => document.removeEventListener("pointerdown", handleOutsidePointer, true);
  }, [isOpen]);

  useEffect(() => {
    if (activeIndex >= filteredCountries.length) {
      setActiveIndex(Math.max(0, filteredCountries.length - 1));
    }
  }, [activeIndex, filteredCountries.length]);

  useEffect(() => {
    if (!isOpen) return;
    const activeCountry = filteredCountries[activeIndex];
    if (activeCountry) {
      document
        .getElementById(`${popupId}-option-${activeCountry.code}`)
        ?.scrollIntoView({ block: "nearest" });
    }
  }, [isOpen, activeIndex, filteredCountries, popupId]);

  const openList = () => {
    if (disabled) return;
    const currentSelectedIndex = selectedCountry
      ? COUNTRY_OPTIONS.findIndex((country) => country.code === selectedCountry.code)
      : 0;
    setActiveIndex(Math.max(0, currentSelectedIndex));
    updatePopupPosition();
    setIsOpen(true);
    // Select the displayed country text so the first typed character replaces
    // it and starts a clean search (rather than being appended to the name).
    window.requestAnimationFrame(() => inputRef.current?.select());
  };

  const closeList = (discardUncommittedSearch = true) => {
    setIsOpen(false);
    positionRef.current = null;
    setPosition(null);
    if (discardUncommittedSearch) {
      setEditingText(null);
      inputRef.current?.setCustomValidity("");
    }
  };

  const chooseCountry = (country: CountryOption) => {
    onChange(valueFormat === "code" ? country.code : country.name);
    setEditingText(null);
    inputRef.current?.setCustomValidity("");
    closeList(false);
    // The selector's input remains focused. Selecting a result does not blur
    // the surrounding form or trigger its touched/validation handlers.
    inputRef.current?.focus();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const isPrintableCharacter = event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey;

    // Type-to-search works from keyboard focus without requiring a mouse click.
    // The first character replaces the selected country text; following
    // characters are handled by the controlled input's onChange event. The
    // anchored result list remains visible throughout the search.
    if (!isOpen && isPrintableCharacter) {
      // Select the displayed label and let the browser insert the first typed
      // character normally. Opening the list must not clear its anchor position
      // after the first character is typed; otherwise the portal disappears
      // while the query remains in the form field.
      event.currentTarget.select();
      setActiveIndex(0);
      updatePopupPosition();
      setIsOpen(true);
      return;
    }

    if (!isOpen && event.key === "Backspace" && selectedCountry) {
      event.preventDefault();
      setEditingText("");
      setActiveIndex(0);
      setIsOpen(true);
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!isOpen) {
        openList();
      } else {
        setActiveIndex((current) => filteredCountries.length === 0
          ? 0
          : (current + 1) % filteredCountries.length);
      }
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!isOpen) {
        openList();
      } else {
        setActiveIndex((current) => filteredCountries.length === 0
          ? 0
          : (current - 1 + filteredCountries.length) % filteredCountries.length);
      }
      return;
    }

    if (event.key === "Home" && isOpen && filteredCountries.length > 0) {
      event.preventDefault();
      setActiveIndex(0);
      return;
    }

    if (event.key === "End" && isOpen && filteredCountries.length > 0) {
      event.preventDefault();
      setActiveIndex(filteredCountries.length - 1);
      return;
    }

    if (event.key === "Enter") {
      // Enter on a focused but closed country field opens the options instead
      // of submitting the surrounding organization form.
      event.preventDefault();
      if (!isOpen) {
        openList();
        return;
      }
      const country = filteredCountries[activeIndex];
      if (country) chooseCountry(country);
      return;
    }

    if (event.key === "Escape" && isOpen) {
      event.preventDefault();
      event.stopPropagation();
      closeList(true);
      return;
    }

    if (event.key === "Tab" && isOpen) {
      // The input remains in the original form DOM, so normal Tab order works.
      closeList(true);
    }
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextQuery = event.target.value;
    setEditingText(nextQuery);
    setActiveIndex(0);
    // Keep the fixed-position portal anchored to this input. If an input event
    // opens the list from a closed state (including assistive keyboard input),
    // measure immediately rather than waiting for the next scroll event.
    if (!isOpen) updatePopupPosition();
    setIsOpen(true);
    if (required) inputRef.current?.setCustomValidity("Choose a country from the results list.");
  };

  const popup = isOpen && portalReady && position
    ? createPortal(
        <div
          ref={popupRef}
          className="fixed z-[10000] overflow-hidden rounded-xl border border-slate-600/80 bg-[#101927] text-slate-100 shadow-[0_24px_70px_rgba(0,0,0,0.6)] ring-1 ring-black/30"
          data-country-select-popup="true"
          style={{
            top: position.top,
            left: position.left,
            width: position.width,
            maxHeight: position.maxHeight,
          }}
        >
          <div
            id={popupId}
            role="listbox"
            aria-label={`Countries, ${filteredCountries.length} results`}
            className="overflow-y-auto overscroll-contain py-1"
            style={{ maxHeight: Math.max(120, position.maxHeight - 34) }}
          >
            {filteredCountries.length === 0 ? (
              <p className="px-3 py-7 text-center text-sm text-slate-400">No matching country. Try its name, ISO code or calling code.</p>
            ) : (
              filteredCountries.map((country, index) => {
                const isSelected = selectedCountry?.code === country.code;
                const isActive = activeIndex === index;
                return (
                  <button
                    key={country.code}
                    id={`${popupId}-option-${country.code}`}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    tabIndex={-1}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => chooseCountry(country)}
                    className={`flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors ${
                      isActive ? "bg-sky-500/15 text-white" : "text-slate-200 hover:bg-white/[0.06]"
                    }`}
                  >
                    <CountryFlag country={country} size="md" />
                    <span className="min-w-0 flex-1 truncate font-medium">{country.name}</span>
                    <span className="shrink-0 text-xs tabular-nums text-slate-400">{country.code}</span>
                    <span className="w-12 shrink-0 text-right text-xs tabular-nums text-slate-400">+{country.callingCode}</span>
                    {isSelected && <span className="ml-1 text-xs font-bold text-sky-300">Selected</span>}
                  </button>
                );
              })
            )}
          </div>
          <div className="border-t border-white/10 bg-[#0c1420] px-3 py-2 text-[10px] text-slate-400">
            ↑ ↓ Navigate · Enter Select · Esc Close
          </div>
        </div>,
        document.body,
      )
    : null;

  return (
    <div ref={rootRef} className="relative min-w-0 w-full">
      <div className="relative min-w-0 w-full">
        {selectedCountry && editingText === null ? (
          <span className="pointer-events-none absolute left-3 top-1/2 z-[1] -translate-y-1/2">
            <CountryFlag country={selectedCountry} size="md" />
          </span>
        ) : (
          <span className="pointer-events-none absolute left-3 top-1/2 z-[1] inline-flex h-[18px] w-[26px] -translate-y-1/2 items-center justify-center rounded-[3px] border border-white/10 bg-white/[0.06] text-slate-400">
            {editingText !== null ? (
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8">
                <circle cx="10.8" cy="10.8" r="6.8" />
                <path d="m16 16 4.5 4.5" strokeLinecap="round" />
              </svg>
            ) : (
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6">
                <circle cx="12" cy="12" r="9" />
                <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
              </svg>
            )}
          </span>
        )}
        <input
          ref={inputRef}
          id={id}
          type="text"
          role="combobox"
          aria-haspopup="listbox"
          aria-autocomplete="list"
          aria-expanded={isOpen}
          aria-controls={isOpen ? popupId : undefined}
          aria-activedescendant={isOpen && filteredCountries[activeIndex] ? `${popupId}-option-${filteredCountries[activeIndex].code}` : undefined}
          aria-required={required}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          autoComplete="off"
          spellCheck={false}
          required={required}
          disabled={disabled}
          value={inputValue}
          onClick={(event) => {
            // Do not reopen/reposition the menu on every click while the
            // employee is editing the search text inside the field.
            if (!isOpen) {
              openList();
              if (selectedLabel) event.currentTarget.select();
            }
          }}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onBlur={(event) => {
            closeList(true);
            onBlur?.(event);
          }}
          placeholder={placeholder}
          className={`${className} country-select-input pr-10 pl-11`}
          data-country-select-input="true"
          style={{
            paddingLeft: "2.75rem",
            paddingRight: "2.5rem",
            color: "#ffffff",
            WebkitTextFillColor: "#ffffff",
            caretColor: "#ffffff",
            backgroundColor: "#0b121d",
            colorScheme: "dark",
          }}
        />
        <svg aria-hidden="true" viewBox="0 0 20 20" className={`pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`} fill="none">
          <path d="m5 7.5 5 5 5-5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <input type="hidden" name={id} value={selectedValue} />
      {popup}
    </div>
  );
}

export function CountryDisplay({
  value,
  className,
}: {
  value: string | null | undefined;
  className?: string;
}) {
  const country = countryOption(value);
  if (!country) {
    return <span className={className} title={value ?? undefined}>{(value ?? "").trim() || "Not provided"}</span>;
  }

  return (
    <span className={`inline-flex min-w-0 items-center gap-2 ${className ?? ""}`} title={country.name}>
      <CountryFlag country={country} size="sm" />
      <span>{country.name}</span>
    </span>
  );
}
