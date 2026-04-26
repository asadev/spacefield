# Global Market Data — Source Reference

> **File:** `lib/global-market-data.ts`
> **Update frequency:** Monthly
> **Last full audit:** 2025-Q1

## How to update

1. Open `lib/global-market-data.ts`
2. Find the city object by `id`
3. Update the relevant metric values
4. Update the `lastUpdated` field to the current quarter (e.g. `"2025-Q2"`)
5. Commit and push

---

## Sources by Region & City

### Middle East

#### Dubai (UAE)
| Metric | Source | URL |
|--------|--------|-----|
| Avg price per sqft/sqm | Dubai Land Department (DLD) Smart Data | https://dubailand.gov.ae |
| Price change YoY | DLD Smart Data + Property Finder Market Reports | https://www.propertyfinder.ae/blog/market-reports/ |
| Rental yields | Property Monitor / Property Finder | https://www.propertymonitor.ae |
| Monthly rent | Bayut/Dubizzle Market Reports | https://www.bayut.com/mybayut/market-report/ |
| Mortgage rates | UAE Central Bank / EIBOR + bank rate sheets | https://www.centralbank.ae |
| Transaction costs | DLD fee schedule (4% DLD + 2% agent standard) | https://dubailand.gov.ae/en/service-fees/ |
| Annual transactions | DLD transaction reports | https://dubailand.gov.ae |
| Golden Visa threshold | ICP / GDRFA official site | https://u.ae/en/information-and-services/visa-and-emirates-id/residence-visa/golden-visa |
| Safety/QoL index | Numbeo | https://www.numbeo.com/quality-of-life/in/Dubai |

#### Abu Dhabi (UAE)
| Metric | Source | URL |
|--------|--------|-----|
| Avg price per sqft/sqm | Abu Dhabi Real Estate Centre (ADREC) | https://www.abudhabi.gov.ae |
| Price change YoY | Bayut Abu Dhabi Market Report | https://www.bayut.com/mybayut/abu-dhabi-market-report/ |
| Rental yields | Property Finder / Bayut | https://www.propertyfinder.ae |
| Monthly rent | Bayut / Property Finder | https://www.bayut.com/mybayut/abu-dhabi-market-report/ |
| Transaction costs | Abu Dhabi Municipality fee schedule | https://www.tamm.abudhabi |

#### Riyadh (Saudi Arabia)
| Metric | Source | URL |
|--------|--------|-----|
| Avg price per sqft/sqm | Ministry of Justice Real Estate Portal | https://aqari.sa |
| Price change YoY | General Authority for Statistics | https://www.stats.gov.sa |
| Rental yields | Knight Frank Saudi Arabia Reports | https://www.knightfrank.com/research |
| Monthly rent | Bayut KSA / Aqar | https://sa.bayut.com |
| Mortgage rates | Saudi Central Bank (SAMA) | https://www.sama.gov.sa |

#### Doha (Qatar)
| Metric | Source | URL |
|--------|--------|-----|
| Avg price per sqft/sqm | Qatar Central Bank RE Index | https://www.qcb.gov.qa |
| Price change YoY | PropertyFinder Qatar | https://www.propertyfinder.qa |
| Monthly rent | PropertyFinder Qatar | https://www.propertyfinder.qa |
| Transaction costs | Ministry of Justice Qatar | https://www.moj.gov.qa |

#### Muscat (Oman)
| Metric | Source | URL |
|--------|--------|-----|
| Avg price per sqft/sqm | National Centre for Statistics and Information | https://www.ncsi.gov.om |
| Price change YoY | Savills Oman Market Report | https://www.savills.com/research_articles |
| Monthly rent | Propertyfinder Oman | https://www.propertyfinder.om |

---

### Europe

#### London (UK)
| Metric | Source | URL |
|--------|--------|-----|
| Avg price per sqft/sqm | UK Land Registry Price Paid Data | https://landregistry.data.gov.uk/app/ppd |
| Price change YoY | ONS House Price Index | https://www.ons.gov.uk/economy/inflationandpriceindices/bulletins/housepriceindex/latest |
| Rental yields | Zoopla Rental Market Report | https://www.zoopla.co.uk/discover/property-news/rental-market-report/ |
| Monthly rent | Rightmove Rental Index | https://www.rightmove.co.uk/news/rental-price-tracker/ |
| Mortgage rates | Bank of England data | https://www.bankofengland.co.uk/statistics |
| Capital gains tax | HMRC | https://www.gov.uk/capital-gains-tax |
| Transaction costs | HMRC Stamp Duty calculator | https://www.gov.uk/stamp-duty-land-tax |
| Annual transactions | HMRC monthly property transactions | https://www.gov.uk/government/statistics/monthly-property-transactions-completed-in-the-uk-with-value-40000-or-above |

#### Paris (France)
| Metric | Source | URL |
|--------|--------|-----|
| Avg price per sqft/sqm | Notaires de France | https://www.immobilier.notaires.fr |
| Price change YoY | INSEE Housing Price Index | https://www.insee.fr/en/statistiques/serie/010605918 |
| Monthly rent | SeLoger market data | https://www.seloger.com |
| Mortgage rates | Banque de France | https://www.banque-france.fr |
| Transaction costs | Notaires de France (droits de mutation) | https://www.immobilier.notaires.fr |

#### Berlin / Munich (Germany)
| Metric | Source | URL |
|--------|--------|-----|
| Avg price per sqft/sqm | Destatis (Federal Statistical Office) | https://www.destatis.de |
| Price change YoY | Hypoport AG Price Index | https://www.europace.de/epx/ |
| Monthly rent | ImmoScout24 Market Reports | https://www.immobilienscout24.de/unternehmen/news/immobilien-marktentwicklung.html |
| Mortgage rates | Deutsche Bundesbank | https://www.bundesbank.de/en/statistics |
| Transaction costs | State-specific Grunderwerbsteuer rates | https://www.destatis.de |
| Capital gains tax | 0% if held >10 years (EStG Section 23) | N/A |

#### Madrid / Barcelona (Spain)
| Metric | Source | URL |
|--------|--------|-----|
| Avg price per sqft/sqm | INE (National Statistics Institute) | https://www.ine.es/dyngs/INEbase/en/operacion.htm?c=Estadistica_C&cid=1254736152838&menu=resultados&idp=1254735976607 |
| Price change YoY | Idealista Market Report | https://www.idealista.com/en/news/property-for-sale-in-spain/market-reports |
| Monthly rent | Idealista Rental Data | https://www.idealista.com/en/news/rental-housing |
| Mortgage rates | Banco de Espana | https://www.bde.es |
| Golden Visa | Abolished in April 2025 — set to null | N/A |

#### Amsterdam (Netherlands)
| Metric | Source | URL |
|--------|--------|-----|
| Avg price per sqft/sqm | CBS StatLine | https://opendata.cbs.nl/statline/#/CBS/en/ |
| Price change YoY | NVM (Dutch Association of Real Estate Agents) | https://www.nvm.nl/en/research/ |
| Monthly rent | Pararius Rent Monitor | https://www.pararius.com/news/rental-prices |
| Mortgage rates | DNB (Dutch Central Bank) | https://www.dnb.nl/en/statistics/ |
| Max LTV | 100% allowed in Netherlands for owner-occupied | N/A |

#### Lisbon (Portugal)
| Metric | Source | URL |
|--------|--------|-----|
| Avg price per sqft/sqm | INE Portugal | https://www.ine.pt |
| Price change YoY | Idealista Portugal | https://www.idealista.pt/en/news/ |
| Golden Visa | SEF / AIMA (fund-based route only since 2023, RE no longer qualifies) | https://www.sef.pt |
| Transaction costs | IMT calculator | https://www.portaldasfinancas.gov.pt |

#### Istanbul (Turkey)
| Metric | Source | URL |
|--------|--------|-----|
| Avg price per sqft/sqm | TURKSTAT Housing Sales Statistics | https://data.tuik.gov.tr |
| Price change YoY | Endeksa / REIDIN Turkey | https://www.endeksa.com |
| Monthly rent | Sahibinden market data | https://www.sahibinden.com |
| Mortgage rates | CBRT (Central Bank of Turkey) | https://www.tcmb.gov.tr/wps/wcm/connect/en/tcmb+en |
| Golden Visa | $400K min purchase for citizenship | https://www.goc.gov.tr |

#### Athens (Greece)
| Metric | Source | URL |
|--------|--------|-----|
| Avg price per sqft/sqm | Bank of Greece RE data | https://www.bankofgreece.gr/en/statistics/realestate |
| Price change YoY | Bank of Greece Residential Property Price Index | https://www.bankofgreece.gr/en/statistics/realestate |
| Monthly rent | Spitogatos Market Reports | https://www.spitogatos.gr |
| Golden Visa | Enterprise Greece | https://www.enterprisegreece.gov.gr/en/greece-today/living-in-greece/golden-visa |

#### Milan / Rome (Italy)
| Metric | Source | URL |
|--------|--------|-----|
| Avg price per sqft/sqm | Agenzia delle Entrate (OMI) | https://www.agenziaentrate.gov.it/portale/web/guest/schede/fabbricatiterreni/omi |
| Price change YoY | Nomisma Real Estate Observatory | https://www.nomisma.it |
| Monthly rent | Immobiliare.it market data | https://www.immobiliare.it |
| Flat tax option | Italy flat tax for foreign rental income: 21% cedolare secca | N/A |

#### Zurich (Switzerland)
| Metric | Source | URL |
|--------|--------|-----|
| Avg price per sqft/sqm | Wuest Partner / SWX IAZI Index | https://www.wuestpartner.com |
| Price change YoY | Swiss National Bank RE indicators | https://data.snb.ch |
| Monthly rent | Homegate Rental Index | https://www.homegate.ch/en/rent/real-estate-index |
| Foreign ownership | Lex Koller restrictions apply to non-residents | https://www.fedlex.admin.ch |

#### Vienna (Austria)
| Metric | Source | URL |
|--------|--------|-----|
| Avg price per sqft/sqm | Statistik Austria | https://www.statistik.at |
| Price change YoY | OeNB (Austrian National Bank) Residential Property Index | https://www.oenb.at/en/Statistics.html |
| Monthly rent | willhaben / ImmobilienScout24 Austria | https://www.willhaben.at |

#### Prague (Czech Republic)
| Metric | Source | URL |
|--------|--------|-----|
| Avg price per sqft/sqm | Czech Statistical Office (CZSO) | https://www.czso.cz/csu/czso/house-price-index |
| Price change YoY | Deloitte Property Index | https://www2.deloitte.com/cz/en.html |
| Monthly rent | Sreality / Bezrealitky | https://www.sreality.cz |
| Capital gains tax | 0% if held >5 years (or >10 years for non-primary) | N/A |

#### Warsaw (Poland)
| Metric | Source | URL |
|--------|--------|-----|
| Avg price per sqft/sqm | NBP (National Bank of Poland) RE Report | https://www.nbp.pl/en/publikacje/rynek-nieruchomosci/ |
| Price change YoY | NBP Residential Property Price Index | https://www.nbp.pl |
| Monthly rent | Otodom market data | https://www.otodom.pl |

#### Budapest (Hungary)
| Metric | Source | URL |
|--------|--------|-----|
| Avg price per sqft/sqm | KSH (Hungarian Central Statistical Office) | https://www.ksh.hu |
| Price change YoY | MNB (Magyar Nemzeti Bank) Housing Market Report | https://www.mnb.hu/en/publications/reports |
| Monthly rent | ingatlan.com market reports | https://www.ingatlan.com |
| Golden Visa | Guest Investor Visa EUR 250K+ property | https://boia.gov.hu |

#### Dublin (Ireland)
| Metric | Source | URL |
|--------|--------|-----|
| Avg price per sqft/sqm | CSO Residential Property Price Index | https://www.cso.ie/en/statistics/prices/residentialpropertypriceindex/ |
| Price change YoY | CSO RPPI | https://www.cso.ie |
| Monthly rent | RTB Rent Index | https://www.rtb.ie/research/rent-index |
| Monthly rent (alt) | Daft.ie Rental Report | https://www.daft.ie/report |

---

### Americas

#### New York (USA)
| Metric | Source | URL |
|--------|--------|-----|
| Avg price per sqft | StreetEasy Market Reports | https://streeteasy.com/blog/data-dashboard/ |
| Price change YoY | S&P/Case-Shiller Home Price Index | https://www.spglobal.com/spdji/en/index-family/indicators/sp-corelogic-case-shiller/ |
| Monthly rent | StreetEasy / Zumper National Rent Report | https://www.zumper.com/rent-research/new-york-ny |
| Mortgage rates | Freddie Mac PMMS | https://www.freddiemac.com/pmms |
| Property tax | NYC DOF | https://www.nyc.gov/site/finance/taxes/property-tax.page |
| Transaction costs | NYC ACRIS | https://www.nyc.gov/site/finance/taxes/acris.page |

#### Miami (USA)
| Metric | Source | URL |
|--------|--------|-----|
| Avg price per sqft | Miami Association of Realtors | https://www.miamirealtors.com/news/research-and-statistics/ |
| Price change YoY | Case-Shiller Miami Index | https://www.spglobal.com/spdji |
| Monthly rent | Zumper National Rent Report | https://www.zumper.com/rent-research/miami-fl |

#### Los Angeles / San Francisco (USA)
| Metric | Source | URL |
|--------|--------|-----|
| Avg price per sqft | Redfin Data Center | https://www.redfin.com/news/data-center/ |
| Price change YoY | Case-Shiller LA / SF Index | https://www.spglobal.com/spdji |
| Monthly rent | Zumper | https://www.zumper.com/rent-research/ |
| Mortgage rates | Freddie Mac PMMS | https://www.freddiemac.com/pmms |
| Property tax | County Assessor (LA County / SF County) | https://assessor.lacounty.gov / https://sfassessor.org |

#### Toronto (Canada)
| Metric | Source | URL |
|--------|--------|-----|
| Avg price per sqft | Toronto Regional Real Estate Board (TRREB) | https://trreb.ca/index.php/market-news/market-stats |
| Price change YoY | TRREB Market Watch | https://trreb.ca |
| Monthly rent | Canada Mortgage and Housing Corporation (CMHC) | https://www.cmhc-schl.gc.ca/professionals/housing-markets-data-and-research |
| Mortgage rates | Bank of Canada | https://www.bankofcanada.ca/rates/interest-rates/ |
| Foreign buyer restrictions | Non-resident ban (Prohibition on Purchase Act) | https://laws-lois.justice.gc.ca |

#### Vancouver (Canada)
| Metric | Source | URL |
|--------|--------|-----|
| Avg price per sqft | Real Estate Board of Greater Vancouver (REBGV) | https://www.rebgv.org/market-watch.html |
| Price change YoY | REBGV Stats Package | https://www.rebgv.org |
| Foreign buyer tax | 20% additional PTT | https://www2.gov.bc.ca/gov/content/taxes/property-taxes/property-transfer-tax/additional-property-transfer-tax |

#### Sao Paulo (Brazil)
| Metric | Source | URL |
|--------|--------|-----|
| Avg price per sqm | FIPE ZAP Index | https://www.fipe.org.br/pt-br/indices/fipezap/ |
| Price change YoY | FIPE ZAP Index | https://www.fipe.org.br |
| Monthly rent | QuintoAndar Index / Viva Real | https://www.quintoandar.com.br |
| Mortgage rates | Banco Central do Brasil | https://www.bcb.gov.br |

#### Mexico City (Mexico)
| Metric | Source | URL |
|--------|--------|-----|
| Avg price per sqm | SHF (Sociedad Hipotecaria Federal) Housing Index | https://www.gob.mx/shf |
| Price change YoY | SHF Price Index | https://www.gob.mx/shf |
| Monthly rent | Inmuebles24 / Propiedades.com | https://www.inmuebles24.com |
| Mortgage rates | Banxico (Central Bank) | https://www.banxico.org.mx |

---

### Asia

#### Singapore
| Metric | Source | URL |
|--------|--------|-----|
| Avg price per sqft | URA REALIS (Real Estate Information System) | https://www.ura.gov.sg/reis/index |
| Price change YoY | URA Private Residential Property Index | https://www.ura.gov.sg/Corporate/Media-Room/Media-Releases |
| Monthly rent | URA REALIS rental data | https://www.ura.gov.sg/reis/index |
| Mortgage rates | MAS (Monetary Authority of Singapore) | https://www.mas.gov.sg |
| Additional Buyer Stamp Duty (foreigners) | 60% ABSD for foreigners | https://www.iras.gov.sg/taxes/stamp-duty/for-property |
| Golden Visa | Global Investor Programme (GIP) — SGD 10M+ | https://www.edb.gov.sg/en/how-we-help/global-investor-programme.html |

#### Hong Kong
| Metric | Source | URL |
|--------|--------|-----|
| Avg price per sqft | Rating and Valuation Dept (RVD) | https://www.rvd.gov.hk/en/property_market_statistics/index.html |
| Price change YoY | Centaline City Leading Index (CCL) | https://www1.centadata.com/cci/cci_e.htm |
| Monthly rent | RVD Private Domestic Rental Index | https://www.rvd.gov.hk |
| Mortgage rates | HKMA | https://www.hkma.gov.hk |
| Note | All HK land is leasehold (govt 50-year leases) | N/A |

#### Tokyo (Japan)
| Metric | Source | URL |
|--------|--------|-----|
| Avg price per sqm | MLIT (Ministry of Land) Real Estate Information | https://www.land.mlit.go.jp/webland/servlet/MainServlet |
| Price change YoY | Japan Real Estate Institute (JREI) | https://www.reinet.or.jp |
| Monthly rent | Homes.co.jp / Suumo market data | https://www.homes.co.jp/chintai/price/ |
| Mortgage rates | BOJ / Flat 35 rates | https://www.flat35.com/english/ |

#### Shanghai / Beijing (China)
| Metric | Source | URL |
|--------|--------|-----|
| Avg price per sqm | NBS (National Bureau of Statistics) 70-City Index | https://www.stats.gov.cn/english/ |
| Price change YoY | NBS 70-City New/Used Home Price Index | https://www.stats.gov.cn |
| Monthly rent | Anjuke / Lianjia (Beike) | https://www.ke.com |
| Mortgage rates | PBOC LPR (Loan Prime Rate) | https://www.pbc.gov.cn |
| Foreign ownership | One property for self-use only (limited) | N/A |

#### Mumbai (India)
| Metric | Source | URL |
|--------|--------|-----|
| Avg price per sqft | Knight Frank India City Reports | https://www.knightfrank.co.in/research |
| Price change YoY | NHB RESIDEX (National Housing Bank Index) | https://residex.nhbonline.org.in |
| Monthly rent | MagicBricks / 99acres | https://www.magicbricks.com |
| Mortgage rates | RBI / SBI home loan rates | https://www.rbi.org.in |
| Registration charges | Maharashtra IGR | https://igrmaharashtra.gov.in |

#### Bangkok (Thailand)
| Metric | Source | URL |
|--------|--------|-----|
| Avg price per sqm | REIC (Real Estate Information Center) | https://www.reic.or.th/en/ |
| Price change YoY | Bank of Thailand RE index | https://www.bot.or.th/en/statistics.html |
| Monthly rent | DDproperty / Hipflat | https://www.ddproperty.com |
| Foreign ownership | Foreigners cannot own land; condo freehold up to 49% of building | N/A |

#### Kuala Lumpur (Malaysia)
| Metric | Source | URL |
|--------|--------|-----|
| Avg price per sqm | NAPIC (National Property Information Centre) | https://napic.jpph.gov.my |
| Price change YoY | NAPIC Malaysian House Price Index | https://napic.jpph.gov.my |
| Monthly rent | PropertyGuru Malaysia | https://www.propertyguru.com.my |
| Foreign ownership | Minimum purchase price varies by state (RM 1M+ in KL) | N/A |
| MM2H visa | Malaysia My Second Home programme | https://www.mm2h.gov.my |

#### Seoul (South Korea)
| Metric | Source | URL |
|--------|--------|-----|
| Avg price per sqm | KB Kookmin Bank House Price Index | https://onland.kbstar.com |
| Price change YoY | Korea Real Estate Board (REB) | https://www.reb.or.kr |
| Monthly rent | Naver Real Estate | https://land.naver.com |
| Mortgage rates | Bank of Korea | https://www.bok.or.kr/eng/main/main.do |
| Capital gains tax | Multi-home owners face up to 75% CGT (policy changes frequently) | N/A |

#### Jakarta (Indonesia)
| Metric | Source | URL |
|--------|--------|-----|
| Avg price per sqm | Bank Indonesia Residential Property Survey | https://www.bi.go.id/en/publikasi/laporan/Pages/SHPR.aspx |
| Price change YoY | BI RPPI (Residential Property Price Index) | https://www.bi.go.id |
| Monthly rent | Rumah123 / Lamudi | https://www.rumah123.com |
| Foreign ownership | "Right to Use" (Hak Pakai) only, no freehold for foreigners | N/A |

---

### Oceania

#### Sydney / Melbourne (Australia)
| Metric | Source | URL |
|--------|--------|-----|
| Avg price per sqm | CoreLogic Home Value Index | https://www.corelogic.com.au/housing-data |
| Price change YoY | CoreLogic Monthly | https://www.corelogic.com.au/news-research |
| Monthly rent | CoreLogic / SQM Research Rental Index | https://sqmresearch.com.au/weekly-rents.php |
| Mortgage rates | RBA (Reserve Bank of Australia) | https://www.rba.gov.au/statistics/interest-rates/ |
| Foreign buyer rules | FIRB approval required + surcharges | https://firb.gov.au |
| Stamp duty | State Revenue Office (NSW / VIC) | https://www.revenue.nsw.gov.au/taxes-duties-levies-royalties/transfer-duty |

#### Auckland (New Zealand)
| Metric | Source | URL |
|--------|--------|-----|
| Avg price per sqm | REINZ (Real Estate Institute of NZ) | https://www.reinz.co.nz/residential-property-data |
| Price change YoY | REINZ Monthly HPI | https://www.reinz.co.nz |
| Monthly rent | Stats NZ Rental Bond Data | https://www.tenancy.govt.nz/about-tenancy-services/data-and-statistics/rental-bond-data/ |
| Mortgage rates | RBNZ | https://www.rbnz.govt.nz/statistics |
| Foreign buyer ban | Overseas Investment Act — non-residents cannot buy existing homes | https://www.linz.govt.nz/overseas-investment |

---

### Africa

#### Cape Town (South Africa)
| Metric | Source | URL |
|--------|--------|-----|
| Avg price per sqm | Lightstone Property | https://www.lightstoneproperty.co.za |
| Price change YoY | FNB House Price Index | https://www.fnb.co.za/economics/economic-outlook/house-price-index.html |
| Monthly rent | PayProp Rental Index | https://www.payprop.com/south-africa/resources/rental-index |
| Mortgage rates | SARB (South African Reserve Bank) | https://www.resbank.co.za |

#### Nairobi (Kenya)
| Metric | Source | URL |
|--------|--------|-----|
| Avg price per sqm | Hass Consult Property Index | https://www.hassconsult.com/real-estate-indices |
| Price change YoY | Hass Consult / Cytonn Real Estate Reports | https://www.cytonn.com/research |
| Monthly rent | BuyRentKenya market data | https://www.buyrentkenya.com |
| Mortgage rates | CBK (Central Bank of Kenya) | https://www.centralbank.go.ke |

#### Cairo (Egypt)
| Metric | Source | URL |
|--------|--------|-----|
| Avg price per sqm | JLL Egypt Market Reports | https://www.jll.com.eg/en/trends-and-insights |
| Price change YoY | CBE (Central Bank of Egypt) + JLL | https://www.cbe.org.eg |
| Monthly rent | Aqarmap / OLX Egypt | https://www.aqarmap.com.eg |
| Mortgage rates | CBE benchmark rate | https://www.cbe.org.eg |
| Note | EGP devaluation makes USD-denominated comparisons volatile — always check exchange rate date | N/A |

---

## Sources by Metric (Cross-City)

### Property Prices — Multi-City Sources
| Source | Coverage | URL |
|--------|----------|-----|
| Numbeo Cost of Living | 500+ cities — price per sqm, rent | https://www.numbeo.com/cost-of-living/ |
| Global Property Guide | 100+ countries — price per sqm, yields, taxes | https://www.globalpropertyguide.com |
| Knight Frank Global House Price Index | 56 countries quarterly | https://www.knightfrank.com/research/global-house-price-index |
| UBS Global Real Estate Bubble Index | 25 major cities annually | https://www.ubs.com/global/en/wealth-management/insights/2024/global-real-estate-bubble-index.html |

### Rental Yields — Multi-City Sources
| Source | Coverage | URL |
|--------|----------|-----|
| Global Property Guide Rental Yields | 100+ countries | https://www.globalpropertyguide.com/rental-yields |
| Numbeo Property Prices Index | City-level rental yields | https://www.numbeo.com/property-investment/ |

### Mortgage Rates — Multi-City Sources
| Source | Coverage | URL |
|--------|----------|-----|
| Trading Economics — Mortgage Rates | 40+ countries | https://tradingeconomics.com/country-list/mortgage-rate |
| Global Property Guide Mortgage Data | 100+ countries | https://www.globalpropertyguide.com/mortgage-rates |

### Transaction Costs & Taxes
| Source | Coverage | URL |
|--------|----------|-----|
| Global Property Guide Transaction Costs | Buyer + seller costs by country | https://www.globalpropertyguide.com/transaction-costs |
| PwC Worldwide Tax Summaries | Tax rates for 150+ countries | https://taxsummaries.pwc.com |
| Deloitte International Tax Source | Property-related taxes | https://www.dits.deloitte.com |
| KPMG Property Tax Rates | Property tax comparison tables | https://kpmg.com/xx/en/home/services/tax.html |

### Golden Visa / Residency by Investment
| Source | Coverage | URL |
|--------|----------|-----|
| Henley & Partners Residence Programs | All active RBI programs | https://www.henleyglobal.com/residence-investment |
| Investment Migration Insider | Program updates and changes | https://www.imidaily.com |

### Safety & Quality of Life
| Source | Coverage | URL |
|--------|----------|-----|
| Numbeo Safety Index | 400+ cities | https://www.numbeo.com/crime/rankings.jsp |
| Numbeo Quality of Life Index | 400+ cities | https://www.numbeo.com/quality-of-life/rankings.jsp |
| Mercer Quality of Living | 230+ cities (paid, but summaries are free) | https://mobilityexchange.mercer.com/quality-of-living-city-rankings |
| EIU Global Liveability Index | 173 cities (paid, summaries free) | https://www.eiu.com/n/campaigns/global-liveability-index/ |

---

## Update Checklist (Monthly)

1. Check Knight Frank Global HPI for quarterly country-level changes
2. Check Numbeo for updated safety/QoL scores
3. For Dubai specifically: pull DLD monthly transaction report from dubailand.gov.ae
4. For key investment cities: check Global Property Guide for updated yields
5. For mortgage rates: check Trading Economics for any central bank rate changes
6. For Golden Visa programs: check Henley & Partners for program changes
7. Update `lastUpdated` field on every city you touch
8. Run `npm run build` to verify no TypeScript errors

---

## Notes

- **Currency:** All prices are in USD. Convert using the exchange rate at time of data collection.
- **Sqft/sqm:** Both provided. Use 1 sqm = 10.764 sqft for conversion.
- **"Average apartment"** refers to a standard 2-bedroom apartment in a decent (not prime) area of the city.
- **Tax rates** are headline rates — actual rates may vary based on exemptions, holding period, residency status, etc.
- **Safety/QoL indices** are from Numbeo and are relative (0-100 scale). They should be compared across cities, not interpreted as absolute measures.
- **Spain Golden Visa** was abolished in April 2025. Lisbon Golden Visa no longer accepts direct property investment (fund route only since 2023).
- **Canada foreign buyer ban** has been extended multiple times — check status before updating Toronto/Vancouver.
