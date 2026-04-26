// Auto-generated from data.json — DO NOT EDIT MANUALLY

export interface Community {
  id: string;
  name: string;
  developer: string;
  status: "established" | "emerging" | "new";
  freeholdStatus: "freehold" | "leasehold";
  propertyTypes: string[];
  pricing: {
    pricePerSqft: { min: number; max: number };
    priceRangeAed: [number, number];
    priceChangeYoY: { min: number; max: number };
    transactionVolume12m: string;
    serviceChargePerSqft: { min: number; max: number };
  };
  investment: {
    rentalYieldPct: { min: number; max: number };
    demandLevel: "high" | "medium" | "low";
    capitalAppreciation3y: { min: number; max: number };
  };
  connectivity: {
    nearestMetro: { name: string; distanceKm: number };
    upcomingMetro: { name: string; expectedYear: number } | null;
    commuteMinutes: { difc: number; businessBay: number; marina: number; airport: number };
    walkabilityScore: number;
  };
  livability: {
    nearbyMalls: string[];
    nearbyHospitals: string[];
    nearbySupermarkets: string[];
    nearbyParks: string[];
    beachDistanceKm: number;
    noiseLevel: "low" | "moderate" | "high";
    petFriendly: boolean;
    communityFeel: string;
  };
  familyFriendliness: {
    schools: { name: string; rating: string; curriculum: string; distanceKm: number }[];
    nearbyNurseries: number;
    playAreas: number;
    safetyPerception: "high" | "medium";
  };
  futureGrowth: {
    dubai2040Impact: "high" | "medium" | "low";
    upcomingProjects: string[];
    infrastructurePlanned: string[];
    completionStatus: number;
  };
  tags: string[];
  description: string;
}

export const communities: Community[] = [
  {
    id: 'downtown-dubai',
    name: 'Downtown Dubai',
    developer: 'Emaar Properties',
    status: 'established',
    freeholdStatus: 'freehold',
    propertyTypes: ['apartment', 'penthouse'],
    pricing: {
      pricePerSqft: {
        min: 2500,
        max: 3500
      },
      priceRangeAed: [900000, 50000000],
      priceChangeYoY: {
        min: 8,
        max: 14
      },
      transactionVolume12m: '4500-5500',
      serviceChargePerSqft: {
        min: 18,
        max: 30
      }
    },
    investment: {
      rentalYieldPct: {
        min: 4.5,
        max: 5.8
      },
      demandLevel: 'high',
      capitalAppreciation3y: {
        min: 30,
        max: 42
      }
    },
    connectivity: {
      nearestMetro: {
        name: 'Burj Khalifa/Dubai Mall',
        distanceKm: 0.3
      },
      upcomingMetro: null,
      commuteMinutes: {
        difc: 5,
        businessBay: 3,
        marina: 20,
        airport: 15
      },
      walkabilityScore: 8
    },
    livability: {
      nearbyMalls: ['Dubai Mall', 'Souk Al Bahar'],
      nearbyHospitals: ['Mediclinic Parkview Hospital', 'Emirates Hospital Day Surgery'],
      nearbySupermarkets: ['Waitrose', 'Carrefour Market', 'Spinneys'],
      nearbyParks: ['Burj Park', 'Downtown Dubai Promenade'],
      beachDistanceKm: 12,
      noiseLevel: 'moderate',
      petFriendly: true,
      communityFeel: 'urban-luxury'
    },
    familyFriendliness: {
      schools: [
        {
          name: 'GEMS Wellington Primary School',
          rating: 'Very Good',
          curriculum: 'UK',
          distanceKm: 3.5
        },
        {
          name: 'JSS International School',
          rating: 'Good',
          curriculum: 'Indian',
          distanceKm: 4
        }
      ],
      nearbyNurseries: 6,
      playAreas: 3,
      safetyPerception: 'high'
    },
    futureGrowth: {
      dubai2040Impact: 'high',
      upcomingProjects: ['Opera Grand Phase 2', 'Downtown Views III'],
      infrastructurePlanned: ['Blue Line Metro Extension'],
      completionStatus: 0.95
    },
    tags: ['luxury', 'urban', 'landmark', 'tourist-hub', 'walkable'],
    description: 'Dubai\'s iconic urban center anchored by Burj Khalifa and Dubai Mall, offering premium high-rise living with world-class amenities and unmatched walkability.'
  },
  {
    id: 'dubai-marina',
    name: 'Dubai Marina',
    developer: 'Emaar Properties / Select Group',
    status: 'established',
    freeholdStatus: 'freehold',
    propertyTypes: ['apartment', 'penthouse'],
    pricing: {
      pricePerSqft: {
        min: 1800,
        max: 2800
      },
      priceRangeAed: [700000, 25000000],
      priceChangeYoY: {
        min: 7,
        max: 12
      },
      transactionVolume12m: '5000-6000',
      serviceChargePerSqft: {
        min: 14,
        max: 22
      }
    },
    investment: {
      rentalYieldPct: {
        min: 5.5,
        max: 7.2
      },
      demandLevel: 'high',
      capitalAppreciation3y: {
        min: 25,
        max: 38
      }
    },
    connectivity: {
      nearestMetro: {
        name: 'DMCC',
        distanceKm: 0.4
      },
      upcomingMetro: null,
      commuteMinutes: {
        difc: 20,
        businessBay: 18,
        marina: 0,
        airport: 30
      },
      walkabilityScore: 8
    },
    livability: {
      nearbyMalls: ['Marina Mall', 'Dubai Marina Mall'],
      nearbyHospitals: ['Mediclinic Dubai Marina', 'Saudi German Hospital'],
      nearbySupermarkets: ['Carrefour Market', 'Choithrams', 'Spinneys'],
      nearbyParks: ['Marina Promenade', 'Marina Walk'],
      beachDistanceKm: 1.2,
      noiseLevel: 'moderate',
      petFriendly: true,
      communityFeel: 'cosmopolitan-waterfront'
    },
    familyFriendliness: {
      schools: [
        {
          name: 'Dubai British School Jumeirah Park',
          rating: 'Very Good',
          curriculum: 'UK',
          distanceKm: 4
        },
        {
          name: 'Kings\' School Al Barsha',
          rating: 'Outstanding',
          curriculum: 'UK',
          distanceKm: 5
        }
      ],
      nearbyNurseries: 8,
      playAreas: 4,
      safetyPerception: 'high'
    },
    futureGrowth: {
      dubai2040Impact: 'medium',
      upcomingProjects: ['Marina Vista Emaar', 'ELIE SAAB Tower'],
      infrastructurePlanned: ['Dubai Tram Extension'],
      completionStatus: 0.92
    },
    tags: ['waterfront', 'nightlife', 'expat-friendly', 'walkable', 'beach-access'],
    description: 'Dubai\'s most vibrant waterfront community with a buzzing marina promenade, tram connectivity, and proximity to JBR beach, hugely popular with young professionals and expats.'
  },
  {
    id: 'jbr',
    name: 'JBR',
    developer: 'Dubai Properties',
    status: 'established',
    freeholdStatus: 'freehold',
    propertyTypes: ['apartment', 'penthouse'],
    pricing: {
      pricePerSqft: {
        min: 1700,
        max: 2600
      },
      priceRangeAed: [650000, 18000000],
      priceChangeYoY: {
        min: 6,
        max: 11
      },
      transactionVolume12m: '2500-3200',
      serviceChargePerSqft: {
        min: 16,
        max: 25
      }
    },
    investment: {
      rentalYieldPct: {
        min: 5.2,
        max: 6.8
      },
      demandLevel: 'high',
      capitalAppreciation3y: {
        min: 22,
        max: 32
      }
    },
    connectivity: {
      nearestMetro: {
        name: 'DMCC',
        distanceKm: 1.2
      },
      upcomingMetro: null,
      commuteMinutes: {
        difc: 22,
        businessBay: 20,
        marina: 3,
        airport: 32
      },
      walkabilityScore: 9
    },
    livability: {
      nearbyMalls: ['The Beach JBR', 'Dubai Marina Mall'],
      nearbyHospitals: ['Mediclinic Dubai Marina'],
      nearbySupermarkets: ['Carrefour', 'Spinneys', 'Waitrose'],
      nearbyParks: ['JBR Walk', 'The Beach'],
      beachDistanceKm: 0.1,
      noiseLevel: 'moderate',
      petFriendly: true,
      communityFeel: 'beachfront-resort'
    },
    familyFriendliness: {
      schools: [
        {
          name: 'Dubai British School Jumeirah Park',
          rating: 'Very Good',
          curriculum: 'UK',
          distanceKm: 5
        },
        {
          name: 'Kings\' School Al Barsha',
          rating: 'Outstanding',
          curriculum: 'UK',
          distanceKm: 6
        }
      ],
      nearbyNurseries: 4,
      playAreas: 5,
      safetyPerception: 'high'
    },
    futureGrowth: {
      dubai2040Impact: 'medium',
      upcomingProjects: ['1/JBR by Dubai Properties'],
      infrastructurePlanned: [],
      completionStatus: 0.98
    },
    tags: ['beachfront', 'tourist-hub', 'walkable', 'dining', 'nightlife'],
    description: 'Dubai\'s premier beachfront destination featuring The Walk and The Beach, offering resort-style living with direct beach access and a vibrant dining and retail scene.'
  },
  {
    id: 'palm-jumeirah',
    name: 'Palm Jumeirah',
    developer: 'Nakheel',
    status: 'established',
    freeholdStatus: 'freehold',
    propertyTypes: ['apartment', 'villa', 'penthouse', 'townhouse'],
    pricing: {
      pricePerSqft: {
        min: 2200,
        max: 4500
      },
      priceRangeAed: [1200000, 150000000],
      priceChangeYoY: {
        min: 10,
        max: 18
      },
      transactionVolume12m: '3000-4000',
      serviceChargePerSqft: {
        min: 20,
        max: 40
      }
    },
    investment: {
      rentalYieldPct: {
        min: 4.0,
        max: 5.5
      },
      demandLevel: 'high',
      capitalAppreciation3y: {
        min: 35,
        max: 55
      }
    },
    connectivity: {
      nearestMetro: {
        name: 'DMCC (via Monorail transfer)',
        distanceKm: 3.5
      },
      upcomingMetro: null,
      commuteMinutes: {
        difc: 25,
        businessBay: 22,
        marina: 10,
        airport: 35
      },
      walkabilityScore: 4
    },
    livability: {
      nearbyMalls: ['Nakheel Mall', 'Golden Mile Galleria'],
      nearbyHospitals: ['King\'s College Hospital London Dubai'],
      nearbySupermarkets: ['Waitrose', 'Carrefour', 'Spinneys'],
      nearbyParks: ['Palm West Beach', 'Al Ittihad Park'],
      beachDistanceKm: 0.1,
      noiseLevel: 'low',
      petFriendly: true,
      communityFeel: 'exclusive-island'
    },
    familyFriendliness: {
      schools: [
        {
          name: 'GEMS Wellington International School',
          rating: 'Outstanding',
          curriculum: 'UK',
          distanceKm: 5
        },
        {
          name: 'Dubai College',
          rating: 'Outstanding',
          curriculum: 'UK',
          distanceKm: 7
        }
      ],
      nearbyNurseries: 5,
      playAreas: 6,
      safetyPerception: 'high'
    },
    futureGrowth: {
      dubai2040Impact: 'medium',
      upcomingProjects: ['Palm Jebel Ali Revival', 'Como Residences', 'Six Senses Residences'],
      infrastructurePlanned: ['Palm Monorail Extension'],
      completionStatus: 0.9
    },
    tags: ['ultra-luxury', 'beachfront', 'island', 'exclusive', 'iconic'],
    description: 'The world-famous man-made island offering ultra-luxury beachfront villas and branded residences, a global symbol of Dubai\'s ambition with unmatched exclusivity.'
  },
  {
    id: 'business-bay',
    name: 'Business Bay',
    developer: 'Various (Dubai Properties, Omniyat, Binghatti)',
    status: 'established',
    freeholdStatus: 'freehold',
    propertyTypes: ['apartment', 'penthouse'],
    pricing: {
      pricePerSqft: {
        min: 1600,
        max: 2800
      },
      priceRangeAed: [550000, 30000000],
      priceChangeYoY: {
        min: 8,
        max: 15
      },
      transactionVolume12m: '6000-7500',
      serviceChargePerSqft: {
        min: 14,
        max: 25
      }
    },
    investment: {
      rentalYieldPct: {
        min: 5.5,
        max: 7.5
      },
      demandLevel: 'high',
      capitalAppreciation3y: {
        min: 28,
        max: 40
      }
    },
    connectivity: {
      nearestMetro: {
        name: 'Business Bay',
        distanceKm: 0.5
      },
      upcomingMetro: null,
      commuteMinutes: {
        difc: 5,
        businessBay: 0,
        marina: 18,
        airport: 14
      },
      walkabilityScore: 7
    },
    livability: {
      nearbyMalls: ['Dubai Mall', 'Bay Avenue'],
      nearbyHospitals: ['Mediclinic Parkview Hospital', 'Aster Hospital'],
      nearbySupermarkets: ['Carrefour', 'Waitrose', 'West Zone'],
      nearbyParks: ['Dubai Water Canal Boardwalk', 'Bay Avenue Park'],
      beachDistanceKm: 13,
      noiseLevel: 'moderate',
      petFriendly: true,
      communityFeel: 'urban-commercial'
    },
    familyFriendliness: {
      schools: [
        {
          name: 'JSS International School',
          rating: 'Good',
          curriculum: 'Indian',
          distanceKm: 3.5
        },
        {
          name: 'GEMS Wellington Primary School',
          rating: 'Very Good',
          curriculum: 'UK',
          distanceKm: 4
        }
      ],
      nearbyNurseries: 5,
      playAreas: 2,
      safetyPerception: 'high'
    },
    futureGrowth: {
      dubai2040Impact: 'high',
      upcomingProjects: ['Dorchester Collection by Omniyat', 'Binghatti Mercedes-Benz Places'],
      infrastructurePlanned: ['Dubai Water Canal Expansion', 'Blue Line Metro'],
      completionStatus: 0.85
    },
    tags: ['urban', 'commercial-hub', 'canal-views', 'high-yield', 'central'],
    description: 'Dubai\'s thriving commercial and residential hub along the canal, offering strong rental yields and proximity to Downtown and DIFC with a rapidly evolving skyline.'
  },
  {
    id: 'jvc',
    name: 'JVC',
    developer: 'Various (Binghatti, Danube, Ellington, Sobha)',
    status: 'established',
    freeholdStatus: 'freehold',
    propertyTypes: ['apartment', 'townhouse', 'villa'],
    pricing: {
      pricePerSqft: {
        min: 900,
        max: 1400
      },
      priceRangeAed: [350000, 3500000],
      priceChangeYoY: {
        min: 10,
        max: 18
      },
      transactionVolume12m: '8000-10000',
      serviceChargePerSqft: {
        min: 8,
        max: 14
      }
    },
    investment: {
      rentalYieldPct: {
        min: 7.0,
        max: 9.5
      },
      demandLevel: 'high',
      capitalAppreciation3y: {
        min: 25,
        max: 40
      }
    },
    connectivity: {
      nearestMetro: {
        name: 'DMCC',
        distanceKm: 5
      },
      upcomingMetro: {
        name: 'JVC Metro',
        expectedYear: 2030
      },
      commuteMinutes: {
        difc: 25,
        businessBay: 22,
        marina: 12,
        airport: 30
      },
      walkabilityScore: 4
    },
    livability: {
      nearbyMalls: ['Circle Mall'],
      nearbyHospitals: ['NMC Royal Hospital', 'Aster Clinic JVC'],
      nearbySupermarkets: ['Carrefour Market', 'Nesto', 'West Zone'],
      nearbyParks: ['JVC Community Park', 'Circle Mall Park'],
      beachDistanceKm: 15,
      noiseLevel: 'low',
      petFriendly: true,
      communityFeel: 'affordable-family'
    },
    familyFriendliness: {
      schools: [
        {
          name: 'JSS International School',
          rating: 'Good',
          curriculum: 'Indian',
          distanceKm: 2
        },
        {
          name: 'Sunmarke School',
          rating: 'Very Good',
          curriculum: 'UK/IB',
          distanceKm: 3
        }
      ],
      nearbyNurseries: 10,
      playAreas: 6,
      safetyPerception: 'high'
    },
    futureGrowth: {
      dubai2040Impact: 'high',
      upcomingProjects: ['Binghatti Ghost', 'Danube Fashionz', 'Ellington Views'],
      infrastructurePlanned: ['JVC Metro Station (Blue Line)', 'Road widening projects'],
      completionStatus: 0.7
    },
    tags: ['affordable', 'high-yield', 'family', 'emerging', 'investor-favorite'],
    description: 'One of Dubai\'s highest-yielding communities with affordable entry points and massive new supply, popular with young families and investors seeking strong returns.'
  },
  {
    id: 'jlt',
    name: 'JLT',
    developer: 'DMCC',
    status: 'established',
    freeholdStatus: 'freehold',
    propertyTypes: ['apartment', 'penthouse'],
    pricing: {
      pricePerSqft: {
        min: 1100,
        max: 1700
      },
      priceRangeAed: [450000, 8000000],
      priceChangeYoY: {
        min: 7,
        max: 12
      },
      transactionVolume12m: '4000-5000',
      serviceChargePerSqft: {
        min: 12,
        max: 18
      }
    },
    investment: {
      rentalYieldPct: {
        min: 6.5,
        max: 8.5
      },
      demandLevel: 'high',
      capitalAppreciation3y: {
        min: 22,
        max: 30
      }
    },
    connectivity: {
      nearestMetro: {
        name: 'DMCC',
        distanceKm: 0.3
      },
      upcomingMetro: null,
      commuteMinutes: {
        difc: 22,
        businessBay: 20,
        marina: 3,
        airport: 32
      },
      walkabilityScore: 7
    },
    livability: {
      nearbyMalls: ['Dubai Marina Mall', 'Ibn Battuta Mall'],
      nearbyHospitals: ['Al Zahra Hospital', 'Mediclinic Meadows'],
      nearbySupermarkets: ['Spinneys', 'Carrefour Market', 'Choithrams'],
      nearbyParks: ['JLT Park', 'Lake Promenade'],
      beachDistanceKm: 3,
      noiseLevel: 'moderate',
      petFriendly: true,
      communityFeel: 'urban-lakeside'
    },
    familyFriendliness: {
      schools: [
        {
          name: 'Dubai British School Jumeirah Park',
          rating: 'Very Good',
          curriculum: 'UK',
          distanceKm: 4
        },
        {
          name: 'Arcadia School',
          rating: 'Good',
          curriculum: 'UK',
          distanceKm: 5
        }
      ],
      nearbyNurseries: 7,
      playAreas: 4,
      safetyPerception: 'high'
    },
    futureGrowth: {
      dubai2040Impact: 'medium',
      upcomingProjects: ['Uptown Tower by DMCC'],
      infrastructurePlanned: [],
      completionStatus: 0.95
    },
    tags: ['lakeside', 'metro-connected', 'affordable-marina', 'dining', 'high-yield'],
    description: 'A cluster-based lakeside community adjacent to Dubai Marina with metro access, offering more affordable waterfront living and strong rental yields.'
  },
  {
    id: 'dubai-hills-estate',
    name: 'Dubai Hills Estate',
    developer: 'Emaar Properties / Meraas',
    status: 'emerging',
    freeholdStatus: 'freehold',
    propertyTypes: ['apartment', 'villa', 'townhouse'],
    pricing: {
      pricePerSqft: {
        min: 1500,
        max: 2500
      },
      priceRangeAed: [800000, 35000000],
      priceChangeYoY: {
        min: 10,
        max: 16
      },
      transactionVolume12m: '5000-6500',
      serviceChargePerSqft: {
        min: 12,
        max: 22
      }
    },
    investment: {
      rentalYieldPct: {
        min: 5.0,
        max: 6.5
      },
      demandLevel: 'high',
      capitalAppreciation3y: {
        min: 30,
        max: 50
      }
    },
    connectivity: {
      nearestMetro: {
        name: 'Dubai Hills Mall (future)',
        distanceKm: 2
      },
      upcomingMetro: {
        name: 'Dubai Hills Metro',
        expectedYear: 2029
      },
      commuteMinutes: {
        difc: 18,
        businessBay: 15,
        marina: 22,
        airport: 22
      },
      walkabilityScore: 5
    },
    livability: {
      nearbyMalls: ['Dubai Hills Mall'],
      nearbyHospitals: ['King\'s College Hospital Dubai Hills'],
      nearbySupermarkets: ['Carrefour', 'Spinneys', 'Geant'],
      nearbyParks: ['Dubai Hills Park', '18-Hole Championship Golf Course'],
      beachDistanceKm: 16,
      noiseLevel: 'low',
      petFriendly: true,
      communityFeel: 'green-suburban-luxury'
    },
    familyFriendliness: {
      schools: [
        {
          name: 'GEMS Wellington Academy Al Khail',
          rating: 'Very Good',
          curriculum: 'UK',
          distanceKm: 2
        },
        {
          name: 'GEMS New Millennium School',
          rating: 'Very Good',
          curriculum: 'Indian',
          distanceKm: 3
        }
      ],
      nearbyNurseries: 8,
      playAreas: 10,
      safetyPerception: 'high'
    },
    futureGrowth: {
      dubai2040Impact: 'high',
      upcomingProjects: ['Park Heights III', 'Elvira by Emaar', 'Golf Gate'],
      infrastructurePlanned: ['Blue Line Metro Station', 'New interchange connections'],
      completionStatus: 0.65
    },
    tags: ['family', 'green', 'golf', 'premium', 'emerging', 'master-planned'],
    description: 'Emaar\'s sprawling master-planned community centered around an 18-hole golf course and Dubai Hills Mall, rapidly becoming one of Dubai\'s most sought-after family neighborhoods.'
  },
  {
    id: 'arabian-ranches-1',
    name: 'Arabian Ranches 1',
    developer: 'Emaar Properties',
    status: 'established',
    freeholdStatus: 'freehold',
    propertyTypes: ['villa', 'townhouse'],
    pricing: {
      pricePerSqft: {
        min: 1200,
        max: 1700
      },
      priceRangeAed: [2800000, 12000000],
      priceChangeYoY: {
        min: 5,
        max: 10
      },
      transactionVolume12m: '1200-1600',
      serviceChargePerSqft: {
        min: 4,
        max: 7
      }
    },
    investment: {
      rentalYieldPct: {
        min: 4.5,
        max: 5.8
      },
      demandLevel: 'high',
      capitalAppreciation3y: {
        min: 25,
        max: 35
      }
    },
    connectivity: {
      nearestMetro: {
        name: 'Mall of the Emirates',
        distanceKm: 12
      },
      upcomingMetro: null,
      commuteMinutes: {
        difc: 25,
        businessBay: 22,
        marina: 20,
        airport: 30
      },
      walkabilityScore: 3
    },
    livability: {
      nearbyMalls: ['Arabian Ranches Retail Centre', 'Dubai Outlet Mall'],
      nearbyHospitals: ['Mediclinic Parkview Hospital'],
      nearbySupermarkets: ['Carrefour Market', 'Spinneys'],
      nearbyParks: ['Arabian Ranches Community Park', 'Arabian Ranches Golf Club'],
      beachDistanceKm: 22,
      noiseLevel: 'low',
      petFriendly: true,
      communityFeel: 'established-suburban-family'
    },
    familyFriendliness: {
      schools: [
        {
          name: 'Jumeirah English Speaking School (JESS) Arabian Ranches',
          rating: 'Outstanding',
          curriculum: 'UK',
          distanceKm: 1
        },
        {
          name: 'Ranches Primary School',
          rating: 'Very Good',
          curriculum: 'UK',
          distanceKm: 0.5
        }
      ],
      nearbyNurseries: 4,
      playAreas: 8,
      safetyPerception: 'high'
    },
    futureGrowth: {
      dubai2040Impact: 'medium',
      upcomingProjects: [],
      infrastructurePlanned: [],
      completionStatus: 1.0
    },
    tags: ['family', 'villa-community', 'golf', 'established', 'quiet', 'pet-friendly'],
    description: 'Dubai\'s original premium villa community with a championship golf course, outstanding schools, and a mature suburban feel—consistently one of the top choices for families.'
  },
  {
    id: 'damac-hills-1',
    name: 'DAMAC Hills 1',
    developer: 'DAMAC Properties',
    status: 'established',
    freeholdStatus: 'freehold',
    propertyTypes: ['apartment', 'villa', 'townhouse'],
    pricing: {
      pricePerSqft: {
        min: 1000,
        max: 1600
      },
      priceRangeAed: [500000, 10000000],
      priceChangeYoY: {
        min: 8,
        max: 14
      },
      transactionVolume12m: '3000-4000',
      serviceChargePerSqft: {
        min: 8,
        max: 15
      }
    },
    investment: {
      rentalYieldPct: {
        min: 5.5,
        max: 7.0
      },
      demandLevel: 'high',
      capitalAppreciation3y: {
        min: 25,
        max: 38
      }
    },
    connectivity: {
      nearestMetro: {
        name: 'Mall of the Emirates',
        distanceKm: 10
      },
      upcomingMetro: null,
      commuteMinutes: {
        difc: 25,
        businessBay: 22,
        marina: 18,
        airport: 30
      },
      walkabilityScore: 3
    },
    livability: {
      nearbyMalls: ['DAMAC Hills Town Centre', 'First Avenue Mall'],
      nearbyHospitals: ['Mediclinic Parkview Hospital'],
      nearbySupermarkets: ['Carrefour Market', 'Spinneys'],
      nearbyParks: ['Trump International Golf Club', 'DAMAC Hills Park'],
      beachDistanceKm: 20,
      noiseLevel: 'low',
      petFriendly: true,
      communityFeel: 'golf-community'
    },
    familyFriendliness: {
      schools: [
        {
          name: 'GEMS Metropole School',
          rating: 'Very Good',
          curriculum: 'UK/IB',
          distanceKm: 3
        },
        {
          name: 'Sunmarke School',
          rating: 'Very Good',
          curriculum: 'UK/IB',
          distanceKm: 5
        }
      ],
      nearbyNurseries: 4,
      playAreas: 6,
      safetyPerception: 'high'
    },
    futureGrowth: {
      dubai2040Impact: 'medium',
      upcomingProjects: ['DAMAC Lagoons Phase 2', 'New hotel towers'],
      infrastructurePlanned: ['Road expansion to Al Khail'],
      completionStatus: 0.8
    },
    tags: ['golf', 'family', 'mixed-use', 'branded-residences', 'green'],
    description: 'A golf-centric master-planned community by DAMAC centered around Trump International Golf Club, offering a mix of branded villas and affordable apartments.'
  },
  {
    id: 'dubai-silicon-oasis',
    name: 'Dubai Silicon Oasis',
    developer: 'Dubai Silicon Oasis Authority',
    status: 'established',
    freeholdStatus: 'freehold',
    propertyTypes: ['apartment', 'villa', 'townhouse'],
    pricing: {
      pricePerSqft: {
        min: 700,
        max: 1100
      },
      priceRangeAed: [280000, 4000000],
      priceChangeYoY: {
        min: 8,
        max: 14
      },
      transactionVolume12m: '3500-4500',
      serviceChargePerSqft: {
        min: 8,
        max: 13
      }
    },
    investment: {
      rentalYieldPct: {
        min: 7.0,
        max: 9.0
      },
      demandLevel: 'medium',
      capitalAppreciation3y: {
        min: 20,
        max: 30
      }
    },
    connectivity: {
      nearestMetro: {
        name: 'Rashidiya',
        distanceKm: 8
      },
      upcomingMetro: {
        name: 'DSO Metro',
        expectedYear: 2030
      },
      commuteMinutes: {
        difc: 28,
        businessBay: 25,
        marina: 35,
        airport: 18
      },
      walkabilityScore: 4
    },
    livability: {
      nearbyMalls: ['Silicon Central Mall', 'Dragon Mart 2'],
      nearbyHospitals: ['Fakeeh University Hospital', 'Thumbay Hospital'],
      nearbySupermarkets: ['Carrefour', 'Lulu Hypermarket', 'Nesto'],
      nearbyParks: ['DSO Central Park', 'Silicon Park'],
      beachDistanceKm: 20,
      noiseLevel: 'low',
      petFriendly: true,
      communityFeel: 'tech-hub-family'
    },
    familyFriendliness: {
      schools: [
        {
          name: 'GEMS Wellington Academy Silicon Oasis',
          rating: 'Very Good',
          curriculum: 'UK',
          distanceKm: 1
        },
        {
          name: 'Delhi Private School',
          rating: 'Good',
          curriculum: 'Indian',
          distanceKm: 2
        }
      ],
      nearbyNurseries: 8,
      playAreas: 6,
      safetyPerception: 'high'
    },
    futureGrowth: {
      dubai2040Impact: 'high',
      upcomingProjects: ['DSO Innovation Hub Expansion'],
      infrastructurePlanned: ['Metro Blue Line Extension to DSO'],
      completionStatus: 0.85
    },
    tags: ['affordable', 'tech-hub', 'family', 'high-yield', 'self-contained'],
    description: 'A tech-focused free zone community offering highly affordable units with excellent yields, popular with tech professionals and families seeking value.'
  },
  {
    id: 'dubai-creek-harbour',
    name: 'Dubai Creek Harbour',
    developer: 'Emaar Properties',
    status: 'emerging',
    freeholdStatus: 'freehold',
    propertyTypes: ['apartment', 'penthouse', 'townhouse'],
    pricing: {
      pricePerSqft: {
        min: 1800,
        max: 2800
      },
      priceRangeAed: [900000, 25000000],
      priceChangeYoY: {
        min: 12,
        max: 20
      },
      transactionVolume12m: '4000-5000',
      serviceChargePerSqft: {
        min: 14,
        max: 22
      }
    },
    investment: {
      rentalYieldPct: {
        min: 5.0,
        max: 6.5
      },
      demandLevel: 'high',
      capitalAppreciation3y: {
        min: 35,
        max: 55
      }
    },
    connectivity: {
      nearestMetro: {
        name: 'Creek',
        distanceKm: 2.5
      },
      upcomingMetro: {
        name: 'Creek Harbour Metro',
        expectedYear: 2028
      },
      commuteMinutes: {
        difc: 12,
        businessBay: 10,
        marina: 30,
        airport: 8
      },
      walkabilityScore: 6
    },
    livability: {
      nearbyMalls: ['Creek Marina Mall (planned)', 'Festival City Mall'],
      nearbyHospitals: ['Mediclinic City Hospital'],
      nearbySupermarkets: ['Carrefour', 'Spinneys'],
      nearbyParks: ['Creek Harbour Central Park', 'Creek Marina Promenade'],
      beachDistanceKm: 8,
      noiseLevel: 'low',
      petFriendly: true,
      communityFeel: 'waterfront-emerging'
    },
    familyFriendliness: {
      schools: [
        {
          name: 'GEMS Heritage Indian School',
          rating: 'Good',
          curriculum: 'Indian',
          distanceKm: 4
        },
        {
          name: 'Hartland International School',
          rating: 'Very Good',
          curriculum: 'UK',
          distanceKm: 5
        }
      ],
      nearbyNurseries: 3,
      playAreas: 4,
      safetyPerception: 'high'
    },
    futureGrowth: {
      dubai2040Impact: 'high',
      upcomingProjects: ['Dubai Creek Tower (Dubai Square)', 'The Grand by Emaar', 'Creek Beach Phase 2'],
      infrastructurePlanned: ['Creek Harbour Metro Station', 'Creek crossing bridge'],
      completionStatus: 0.45
    },
    tags: ['waterfront', 'emerging', 'premium', 'creek-views', 'high-growth'],
    description: 'Emaar\'s ambitious waterfront development along Dubai Creek, home to the future Dubai Creek Tower, offering premium creek-view living with massive appreciation potential.'
  },
  {
    id: 'mbr-city',
    name: 'MBR City',
    developer: 'Various (Emaar, Sobha, Meydan)',
    status: 'emerging',
    freeholdStatus: 'freehold',
    propertyTypes: ['apartment', 'villa', 'townhouse'],
    pricing: {
      pricePerSqft: {
        min: 1300,
        max: 2200
      },
      priceRangeAed: [700000, 20000000],
      priceChangeYoY: {
        min: 10,
        max: 16
      },
      transactionVolume12m: '5000-6500',
      serviceChargePerSqft: {
        min: 10,
        max: 18
      }
    },
    investment: {
      rentalYieldPct: {
        min: 5.5,
        max: 7.0
      },
      demandLevel: 'high',
      capitalAppreciation3y: {
        min: 28,
        max: 45
      }
    },
    connectivity: {
      nearestMetro: {
        name: 'Business Bay',
        distanceKm: 5
      },
      upcomingMetro: {
        name: 'MBR City Metro',
        expectedYear: 2029
      },
      commuteMinutes: {
        difc: 15,
        businessBay: 12,
        marina: 25,
        airport: 18
      },
      walkabilityScore: 4
    },
    livability: {
      nearbyMalls: ['Meydan One Mall (planned)', 'Dubai Hills Mall'],
      nearbyHospitals: ['Mediclinic Parkview Hospital'],
      nearbySupermarkets: ['Carrefour', 'Spinneys'],
      nearbyParks: ['District One Crystal Lagoon', 'Meydan Racecourse'],
      beachDistanceKm: 18,
      noiseLevel: 'low',
      petFriendly: true,
      communityFeel: 'emerging-luxury'
    },
    familyFriendliness: {
      schools: [
        {
          name: 'Hartland International School',
          rating: 'Very Good',
          curriculum: 'UK',
          distanceKm: 2
        },
        {
          name: 'North London Collegiate School',
          rating: 'Outstanding',
          curriculum: 'UK',
          distanceKm: 3
        }
      ],
      nearbyNurseries: 5,
      playAreas: 6,
      safetyPerception: 'high'
    },
    futureGrowth: {
      dubai2040Impact: 'high',
      upcomingProjects: ['Meydan One Mall & Tower', 'District One Phase 2', 'Riviera by Azizi'],
      infrastructurePlanned: ['MBR City Metro Line', 'Meydan One development'],
      completionStatus: 0.45
    },
    tags: ['master-planned', 'emerging', 'lagoon', 'racecourse', 'premium'],
    description: 'A massive master-planned district spanning Meydan and surrounding sub-communities, offering everything from crystal lagoon villas to affordable apartments with enormous growth potential.'
  },
  {
    id: 'sobha-hartland',
    name: 'Sobha Hartland',
    developer: 'Sobha Realty',
    status: 'emerging',
    freeholdStatus: 'freehold',
    propertyTypes: ['apartment', 'villa', 'townhouse'],
    pricing: {
      pricePerSqft: {
        min: 1800,
        max: 2600
      },
      priceRangeAed: [1000000, 25000000],
      priceChangeYoY: {
        min: 12,
        max: 18
      },
      transactionVolume12m: '2500-3500',
      serviceChargePerSqft: {
        min: 14,
        max: 20
      }
    },
    investment: {
      rentalYieldPct: {
        min: 5.0,
        max: 6.5
      },
      demandLevel: 'high',
      capitalAppreciation3y: {
        min: 30,
        max: 48
      }
    },
    connectivity: {
      nearestMetro: {
        name: 'Business Bay',
        distanceKm: 4
      },
      upcomingMetro: {
        name: 'MBR City Metro',
        expectedYear: 2029
      },
      commuteMinutes: {
        difc: 12,
        businessBay: 10,
        marina: 25,
        airport: 15
      },
      walkabilityScore: 5
    },
    livability: {
      nearbyMalls: ['Dubai Hills Mall', 'Meydan One Mall (planned)'],
      nearbyHospitals: ['Mediclinic Parkview Hospital'],
      nearbySupermarkets: ['Carrefour Market', 'Spinneys'],
      nearbyParks: ['Sobha Hartland Greens', 'Hartland Park'],
      beachDistanceKm: 15,
      noiseLevel: 'low',
      petFriendly: true,
      communityFeel: 'premium-green'
    },
    familyFriendliness: {
      schools: [
        {
          name: 'Hartland International School',
          rating: 'Very Good',
          curriculum: 'UK',
          distanceKm: 0.5
        },
        {
          name: 'North London Collegiate School',
          rating: 'Outstanding',
          curriculum: 'UK',
          distanceKm: 2
        }
      ],
      nearbyNurseries: 3,
      playAreas: 5,
      safetyPerception: 'high'
    },
    futureGrowth: {
      dubai2040Impact: 'high',
      upcomingProjects: ['Sobha Hartland II', 'Sobha SeaHaven', 'One Park Avenue'],
      infrastructurePlanned: ['MBR City Metro Station'],
      completionStatus: 0.55
    },
    tags: ['premium', 'green', 'quality-build', 'waterfront', 'family'],
    description: 'Sobha Realty\'s signature development in MBR City known for superior build quality and lush green spaces, with its own international school and strong capital growth.'
  },
  {
    id: 'emaar-beachfront',
    name: 'Emaar Beachfront',
    developer: 'Emaar Properties',
    status: 'emerging',
    freeholdStatus: 'freehold',
    propertyTypes: ['apartment', 'penthouse'],
    pricing: {
      pricePerSqft: {
        min: 2200,
        max: 3200
      },
      priceRangeAed: [1500000, 30000000],
      priceChangeYoY: {
        min: 10,
        max: 16
      },
      transactionVolume12m: '1500-2000',
      serviceChargePerSqft: {
        min: 18,
        max: 28
      }
    },
    investment: {
      rentalYieldPct: {
        min: 5.0,
        max: 6.2
      },
      demandLevel: 'high',
      capitalAppreciation3y: {
        min: 30,
        max: 45
      }
    },
    connectivity: {
      nearestMetro: {
        name: 'DMCC',
        distanceKm: 2.5
      },
      upcomingMetro: null,
      commuteMinutes: {
        difc: 22,
        businessBay: 20,
        marina: 5,
        airport: 32
      },
      walkabilityScore: 6
    },
    livability: {
      nearbyMalls: ['Dubai Marina Mall', 'The Beach JBR'],
      nearbyHospitals: ['Mediclinic Dubai Marina'],
      nearbySupermarkets: ['Carrefour', 'Waitrose'],
      nearbyParks: ['Emaar Beachfront Promenade', 'Private Beach'],
      beachDistanceKm: 0.05,
      noiseLevel: 'low',
      petFriendly: true,
      communityFeel: 'exclusive-beachfront'
    },
    familyFriendliness: {
      schools: [
        {
          name: 'Dubai British School Jumeirah Park',
          rating: 'Very Good',
          curriculum: 'UK',
          distanceKm: 5
        },
        {
          name: 'Kings\' School Al Barsha',
          rating: 'Outstanding',
          curriculum: 'UK',
          distanceKm: 7
        }
      ],
      nearbyNurseries: 2,
      playAreas: 3,
      safetyPerception: 'high'
    },
    futureGrowth: {
      dubai2040Impact: 'medium',
      upcomingProjects: ['Grand Bleu Tower by Elie Saab', 'Beach Isle'],
      infrastructurePlanned: [],
      completionStatus: 0.7
    },
    tags: ['beachfront', 'premium', 'marina-adjacent', 'exclusive', 'branded'],
    description: 'Emaar\'s exclusive beachfront island between JBR and Palm Jumeirah offering private beach access, marina views, and branded residences in a gated setting.'
  },
  {
    id: 'arabian-ranches-2',
    name: 'Arabian Ranches 2',
    developer: 'Emaar Properties',
    status: 'established',
    freeholdStatus: 'freehold',
    propertyTypes: ['villa', 'townhouse'],
    pricing: {
      pricePerSqft: {
        min: 1100,
        max: 1500
      },
      priceRangeAed: [2200000, 8000000],
      priceChangeYoY: {
        min: 6,
        max: 12
      },
      transactionVolume12m: '1500-2000',
      serviceChargePerSqft: {
        min: 4,
        max: 6
      }
    },
    investment: {
      rentalYieldPct: {
        min: 5.0,
        max: 6.0
      },
      demandLevel: 'high',
      capitalAppreciation3y: {
        min: 22,
        max: 32
      }
    },
    connectivity: {
      nearestMetro: {
        name: 'Mall of the Emirates',
        distanceKm: 14
      },
      upcomingMetro: null,
      commuteMinutes: {
        difc: 28,
        businessBay: 25,
        marina: 22,
        airport: 32
      },
      walkabilityScore: 3
    },
    livability: {
      nearbyMalls: ['Arabian Ranches Retail Centre', 'Dubai Outlet Mall'],
      nearbyHospitals: ['Mediclinic Parkview Hospital'],
      nearbySupermarkets: ['Carrefour Market', 'Geant'],
      nearbyParks: ['Community Pool & Park', 'Central Green Spaces'],
      beachDistanceKm: 24,
      noiseLevel: 'low',
      petFriendly: true,
      communityFeel: 'modern-suburban-family'
    },
    familyFriendliness: {
      schools: [
        {
          name: 'JESS Arabian Ranches',
          rating: 'Outstanding',
          curriculum: 'UK',
          distanceKm: 2
        },
        {
          name: 'Ranches Primary School',
          rating: 'Very Good',
          curriculum: 'UK',
          distanceKm: 2
        }
      ],
      nearbyNurseries: 3,
      playAreas: 8,
      safetyPerception: 'high'
    },
    futureGrowth: {
      dubai2040Impact: 'medium',
      upcomingProjects: [],
      infrastructurePlanned: [],
      completionStatus: 0.95
    },
    tags: ['family', 'villa-community', 'quiet', 'community-pool', 'modern'],
    description: 'The newer extension of Arabian Ranches offering modern villa designs with community pools and landscaped parks, sharing access to the outstanding JESS school.'
  },
  {
    id: 'arabian-ranches-3',
    name: 'Arabian Ranches 3',
    developer: 'Emaar Properties',
    status: 'new',
    freeholdStatus: 'freehold',
    propertyTypes: ['villa', 'townhouse'],
    pricing: {
      pricePerSqft: {
        min: 1000,
        max: 1400
      },
      priceRangeAed: [1800000, 6000000],
      priceChangeYoY: {
        min: 12,
        max: 20
      },
      transactionVolume12m: '2000-2800',
      serviceChargePerSqft: {
        min: 4,
        max: 6
      }
    },
    investment: {
      rentalYieldPct: {
        min: 5.5,
        max: 6.8
      },
      demandLevel: 'high',
      capitalAppreciation3y: {
        min: 25,
        max: 40
      }
    },
    connectivity: {
      nearestMetro: {
        name: 'Mall of the Emirates',
        distanceKm: 16
      },
      upcomingMetro: null,
      commuteMinutes: {
        difc: 30,
        businessBay: 28,
        marina: 25,
        airport: 35
      },
      walkabilityScore: 3
    },
    livability: {
      nearbyMalls: ['Arabian Ranches Retail Centre'],
      nearbyHospitals: ['Mediclinic Parkview Hospital'],
      nearbySupermarkets: ['Carrefour Market'],
      nearbyParks: ['Community Clubhouse & Park', 'Splash Pads'],
      beachDistanceKm: 26,
      noiseLevel: 'low',
      petFriendly: true,
      communityFeel: 'new-suburban-family'
    },
    familyFriendliness: {
      schools: [
        {
          name: 'JESS Arabian Ranches',
          rating: 'Outstanding',
          curriculum: 'UK',
          distanceKm: 3
        },
        {
          name: 'Ranches Primary School',
          rating: 'Very Good',
          curriculum: 'UK',
          distanceKm: 3.5
        }
      ],
      nearbyNurseries: 2,
      playAreas: 6,
      safetyPerception: 'high'
    },
    futureGrowth: {
      dubai2040Impact: 'medium',
      upcomingProjects: ['Sun by Emaar', 'Caya Phase 3', 'Ruba Phase 2'],
      infrastructurePlanned: ['Community retail expansion'],
      completionStatus: 0.5
    },
    tags: ['family', 'villa-community', 'new-launch', 'affordable-villa', 'emerging'],
    description: 'Emaar\'s newest Arabian Ranches phase with more affordable villa options and modern community amenities, still under active development with strong early appreciation.'
  },
  {
    id: 'damac-hills-2',
    name: 'DAMAC Hills 2',
    developer: 'DAMAC Properties',
    status: 'emerging',
    freeholdStatus: 'freehold',
    propertyTypes: ['villa', 'townhouse'],
    pricing: {
      pricePerSqft: {
        min: 600,
        max: 900
      },
      priceRangeAed: [800000, 3500000],
      priceChangeYoY: {
        min: 10,
        max: 16
      },
      transactionVolume12m: '3000-4000',
      serviceChargePerSqft: {
        min: 3,
        max: 5
      }
    },
    investment: {
      rentalYieldPct: {
        min: 6.0,
        max: 8.0
      },
      demandLevel: 'medium',
      capitalAppreciation3y: {
        min: 25,
        max: 40
      }
    },
    connectivity: {
      nearestMetro: {
        name: 'JAFZA',
        distanceKm: 18
      },
      upcomingMetro: null,
      commuteMinutes: {
        difc: 35,
        businessBay: 32,
        marina: 28,
        airport: 40
      },
      walkabilityScore: 2
    },
    livability: {
      nearbyMalls: ['DAMAC Hills 2 Retail'],
      nearbyHospitals: ['Aster Clinic DAMAC Hills 2'],
      nearbySupermarkets: ['Viva Supermarket', 'West Zone'],
      nearbyParks: ['Community Lagoon', 'Sports Courts'],
      beachDistanceKm: 30,
      noiseLevel: 'low',
      petFriendly: true,
      communityFeel: 'budget-villa-suburban'
    },
    familyFriendliness: {
      schools: [
        {
          name: 'GEMS Metropole School',
          rating: 'Very Good',
          curriculum: 'UK/IB',
          distanceKm: 8
        },
        {
          name: 'Sunmarke School',
          rating: 'Very Good',
          curriculum: 'UK/IB',
          distanceKm: 10
        }
      ],
      nearbyNurseries: 2,
      playAreas: 4,
      safetyPerception: 'medium'
    },
    futureGrowth: {
      dubai2040Impact: 'medium',
      upcomingProjects: ['DAMAC Lagoons', 'Water Park'],
      infrastructurePlanned: ['Road connectivity improvements'],
      completionStatus: 0.6
    },
    tags: ['affordable-villa', 'budget', 'family', 'lagoon', 'emerging'],
    description: 'DAMAC\'s affordable villa community on the outskirts of Dubai offering budget-friendly townhouses with community lagoons, ideal for first-time villa buyers willing to trade location for space.'
  },
  {
    id: 'dubai-sports-city',
    name: 'Dubai Sports City',
    developer: 'Dubai Sports City LLC',
    status: 'established',
    freeholdStatus: 'freehold',
    propertyTypes: ['apartment', 'villa', 'townhouse'],
    pricing: {
      pricePerSqft: {
        min: 700,
        max: 1100
      },
      priceRangeAed: [300000, 4000000],
      priceChangeYoY: {
        min: 8,
        max: 14
      },
      transactionVolume12m: '2500-3500',
      serviceChargePerSqft: {
        min: 8,
        max: 14
      }
    },
    investment: {
      rentalYieldPct: {
        min: 7.0,
        max: 9.0
      },
      demandLevel: 'medium',
      capitalAppreciation3y: {
        min: 18,
        max: 28
      }
    },
    connectivity: {
      nearestMetro: {
        name: 'Mall of the Emirates',
        distanceKm: 10
      },
      upcomingMetro: null,
      commuteMinutes: {
        difc: 25,
        businessBay: 22,
        marina: 18,
        airport: 30
      },
      walkabilityScore: 3
    },
    livability: {
      nearbyMalls: ['First Avenue Mall', 'Dubai Outlet Mall'],
      nearbyHospitals: ['Mediclinic Parkview Hospital'],
      nearbySupermarkets: ['Carrefour Market', 'West Zone'],
      nearbyParks: ['Victory Heights Community', 'Dubai International Cricket Stadium'],
      beachDistanceKm: 22,
      noiseLevel: 'low',
      petFriendly: true,
      communityFeel: 'sports-lifestyle'
    },
    familyFriendliness: {
      schools: [
        {
          name: 'GEMS United School',
          rating: 'Good',
          curriculum: 'UK',
          distanceKm: 2
        },
        {
          name: 'Nord Anglia International School',
          rating: 'Very Good',
          curriculum: 'IB',
          distanceKm: 4
        }
      ],
      nearbyNurseries: 4,
      playAreas: 6,
      safetyPerception: 'high'
    },
    futureGrowth: {
      dubai2040Impact: 'medium',
      upcomingProjects: ['Sports City commercial expansion'],
      infrastructurePlanned: [],
      completionStatus: 0.85
    },
    tags: ['sports', 'affordable', 'high-yield', 'cricket', 'family'],
    description: 'A sports-themed community home to the ICC Academy and Dubai International Cricket Stadium, offering affordable apartments with strong yields in a car-dependent location.'
  },
  {
    id: 'motor-city',
    name: 'Motor City',
    developer: 'Union Properties',
    status: 'established',
    freeholdStatus: 'freehold',
    propertyTypes: ['apartment', 'villa', 'townhouse'],
    pricing: {
      pricePerSqft: {
        min: 800,
        max: 1200
      },
      priceRangeAed: [350000, 4500000],
      priceChangeYoY: {
        min: 7,
        max: 12
      },
      transactionVolume12m: '1500-2000',
      serviceChargePerSqft: {
        min: 8,
        max: 13
      }
    },
    investment: {
      rentalYieldPct: {
        min: 6.5,
        max: 8.0
      },
      demandLevel: 'medium',
      capitalAppreciation3y: {
        min: 18,
        max: 28
      }
    },
    connectivity: {
      nearestMetro: {
        name: 'Mall of the Emirates',
        distanceKm: 10
      },
      upcomingMetro: null,
      commuteMinutes: {
        difc: 25,
        businessBay: 22,
        marina: 18,
        airport: 30
      },
      walkabilityScore: 4
    },
    livability: {
      nearbyMalls: ['First Avenue Mall', 'Dubai Autodrome'],
      nearbyHospitals: ['Mediclinic Parkview Hospital'],
      nearbySupermarkets: ['Spinneys', 'Carrefour Market'],
      nearbyParks: ['Motor City Green Belt', 'Uptown Community Park'],
      beachDistanceKm: 22,
      noiseLevel: 'low',
      petFriendly: true,
      communityFeel: 'quiet-suburban'
    },
    familyFriendliness: {
      schools: [
        {
          name: 'GEMS United School',
          rating: 'Good',
          curriculum: 'UK',
          distanceKm: 2
        },
        {
          name: 'Nord Anglia International School',
          rating: 'Very Good',
          curriculum: 'IB',
          distanceKm: 3
        }
      ],
      nearbyNurseries: 3,
      playAreas: 4,
      safetyPerception: 'high'
    },
    futureGrowth: {
      dubai2040Impact: 'low',
      upcomingProjects: [],
      infrastructurePlanned: [],
      completionStatus: 0.95
    },
    tags: ['quiet', 'affordable', 'family', 'autodrome', 'green'],
    description: 'A quiet, self-contained community adjacent to Dubai Autodrome, offering affordable family living with generous green spaces and low service charges.'
  },
  {
    id: 'international-city',
    name: 'International City',
    developer: 'Nakheel',
    status: 'established',
    freeholdStatus: 'freehold',
    propertyTypes: ['apartment'],
    pricing: {
      pricePerSqft: {
        min: 450,
        max: 700
      },
      priceRangeAed: [180000, 600000],
      priceChangeYoY: {
        min: 10,
        max: 18
      },
      transactionVolume12m: '5000-7000',
      serviceChargePerSqft: {
        min: 6,
        max: 10
      }
    },
    investment: {
      rentalYieldPct: {
        min: 8.0,
        max: 11.0
      },
      demandLevel: 'high',
      capitalAppreciation3y: {
        min: 20,
        max: 35
      }
    },
    connectivity: {
      nearestMetro: {
        name: 'Rashidiya',
        distanceKm: 10
      },
      upcomingMetro: null,
      commuteMinutes: {
        difc: 30,
        businessBay: 28,
        marina: 40,
        airport: 20
      },
      walkabilityScore: 3
    },
    livability: {
      nearbyMalls: ['Dragon Mart', 'Dragon Mart 2'],
      nearbyHospitals: ['Thumbay Hospital'],
      nearbySupermarkets: ['Carrefour', 'Nesto', 'Lulu Express'],
      nearbyParks: ['International City Park'],
      beachDistanceKm: 22,
      noiseLevel: 'moderate',
      petFriendly: false,
      communityFeel: 'budget-multicultural'
    },
    familyFriendliness: {
      schools: [
        {
          name: 'The Sheffield Private School',
          rating: 'Acceptable',
          curriculum: 'UK',
          distanceKm: 2
        },
        {
          name: 'Delhi Private School Sharjah',
          rating: 'Good',
          curriculum: 'Indian',
          distanceKm: 8
        }
      ],
      nearbyNurseries: 5,
      playAreas: 2,
      safetyPerception: 'medium'
    },
    futureGrowth: {
      dubai2040Impact: 'medium',
      upcomingProjects: ['International City Phase 3'],
      infrastructurePlanned: ['Road widening'],
      completionStatus: 0.85
    },
    tags: ['budget', 'high-yield', 'investor', 'multicultural', 'dragon-mart'],
    description: 'Dubai\'s most affordable freehold community offering the highest yields in the city, popular with budget-conscious investors and a diverse expat population.'
  },
  {
    id: 'discovery-gardens',
    name: 'Discovery Gardens',
    developer: 'Nakheel',
    status: 'established',
    freeholdStatus: 'leasehold',
    propertyTypes: ['apartment'],
    pricing: {
      pricePerSqft: {
        min: 550,
        max: 800
      },
      priceRangeAed: [250000, 700000],
      priceChangeYoY: {
        min: 8,
        max: 14
      },
      transactionVolume12m: '2000-2800',
      serviceChargePerSqft: {
        min: 8,
        max: 12
      }
    },
    investment: {
      rentalYieldPct: {
        min: 7.5,
        max: 10.0
      },
      demandLevel: 'medium',
      capitalAppreciation3y: {
        min: 15,
        max: 25
      }
    },
    connectivity: {
      nearestMetro: {
        name: 'Ibn Battuta',
        distanceKm: 1.5
      },
      upcomingMetro: null,
      commuteMinutes: {
        difc: 30,
        businessBay: 28,
        marina: 10,
        airport: 35
      },
      walkabilityScore: 4
    },
    livability: {
      nearbyMalls: ['Ibn Battuta Mall'],
      nearbyHospitals: ['NMC Royal Hospital'],
      nearbySupermarkets: ['Carrefour', 'Choithrams', 'West Zone'],
      nearbyParks: ['Discovery Gardens Park'],
      beachDistanceKm: 8,
      noiseLevel: 'moderate',
      petFriendly: false,
      communityFeel: 'budget-residential'
    },
    familyFriendliness: {
      schools: [
        {
          name: 'The Winchester School',
          rating: 'Good',
          curriculum: 'Indian',
          distanceKm: 2
        },
        {
          name: 'GEMS Our Own English High School',
          rating: 'Good',
          curriculum: 'Indian',
          distanceKm: 3
        }
      ],
      nearbyNurseries: 4,
      playAreas: 3,
      safetyPerception: 'medium'
    },
    futureGrowth: {
      dubai2040Impact: 'low',
      upcomingProjects: [],
      infrastructurePlanned: [],
      completionStatus: 1.0
    },
    tags: ['budget', 'metro-access', 'leasehold', 'high-yield'],
    description: 'An affordable leasehold community near Ibn Battuta Mall with metro access, offering strong rental yields for budget-conscious investors.'
  },
  {
    id: 'al-furjan',
    name: 'Al Furjan',
    developer: 'Nakheel',
    status: 'established',
    freeholdStatus: 'freehold',
    propertyTypes: ['villa', 'townhouse', 'apartment'],
    pricing: {
      pricePerSqft: {
        min: 900,
        max: 1400
      },
      priceRangeAed: [400000, 6000000],
      priceChangeYoY: {
        min: 8,
        max: 14
      },
      transactionVolume12m: '2500-3500',
      serviceChargePerSqft: {
        min: 5,
        max: 10
      }
    },
    investment: {
      rentalYieldPct: {
        min: 5.5,
        max: 7.5
      },
      demandLevel: 'high',
      capitalAppreciation3y: {
        min: 20,
        max: 32
      }
    },
    connectivity: {
      nearestMetro: {
        name: 'Furjan (Route 2020)',
        distanceKm: 0.8
      },
      upcomingMetro: null,
      commuteMinutes: {
        difc: 28,
        businessBay: 25,
        marina: 12,
        airport: 35
      },
      walkabilityScore: 4
    },
    livability: {
      nearbyMalls: ['Ibn Battuta Mall', 'Al Furjan Pavilion'],
      nearbyHospitals: ['NMC Royal Hospital'],
      nearbySupermarkets: ['Spinneys', 'Carrefour Market', 'West Zone'],
      nearbyParks: ['Al Furjan Community Park'],
      beachDistanceKm: 10,
      noiseLevel: 'low',
      petFriendly: true,
      communityFeel: 'family-suburban'
    },
    familyFriendliness: {
      schools: [
        {
          name: 'Arcadia School',
          rating: 'Good',
          curriculum: 'UK',
          distanceKm: 1.5
        },
        {
          name: 'The Arbor School',
          rating: 'Good',
          curriculum: 'IB',
          distanceKm: 3
        }
      ],
      nearbyNurseries: 5,
      playAreas: 6,
      safetyPerception: 'high'
    },
    futureGrowth: {
      dubai2040Impact: 'medium',
      upcomingProjects: ['Al Furjan East Phase'],
      infrastructurePlanned: ['Route 2020 extensions'],
      completionStatus: 0.9
    },
    tags: ['family', 'metro-connected', 'villa-community', 'value', 'suburban'],
    description: 'A well-established Nakheel villa and townhouse community with Route 2020 metro access, offering good value for families wanting suburban living with city connectivity.'
  },
  {
    id: 'dubai-south',
    name: 'Dubai South',
    developer: 'Dubai South (Government)',
    status: 'new',
    freeholdStatus: 'freehold',
    propertyTypes: ['apartment', 'villa', 'townhouse'],
    pricing: {
      pricePerSqft: {
        min: 600,
        max: 1000
      },
      priceRangeAed: [300000, 3000000],
      priceChangeYoY: {
        min: 12,
        max: 22
      },
      transactionVolume12m: '3000-4000',
      serviceChargePerSqft: {
        min: 5,
        max: 9
      }
    },
    investment: {
      rentalYieldPct: {
        min: 6.5,
        max: 9.0
      },
      demandLevel: 'medium',
      capitalAppreciation3y: {
        min: 20,
        max: 35
      }
    },
    connectivity: {
      nearestMetro: {
        name: 'Expo 2020 / Route 2020',
        distanceKm: 2
      },
      upcomingMetro: null,
      commuteMinutes: {
        difc: 35,
        businessBay: 32,
        marina: 25,
        airport: 45
      },
      walkabilityScore: 2
    },
    livability: {
      nearbyMalls: ['Dubai South Mall (planned)', 'Ibn Battuta Mall'],
      nearbyHospitals: ['Mediclinic (planned)'],
      nearbySupermarkets: ['Carrefour', 'West Zone'],
      nearbyParks: ['Expo Gardens', 'The Pulse Park'],
      beachDistanceKm: 20,
      noiseLevel: 'low',
      petFriendly: true,
      communityFeel: 'emerging-airport-city'
    },
    familyFriendliness: {
      schools: [
        {
          name: 'South View School',
          rating: 'Good',
          curriculum: 'UK',
          distanceKm: 3
        },
        {
          name: 'GEMS Founders School',
          rating: 'Good',
          curriculum: 'US',
          distanceKm: 5
        }
      ],
      nearbyNurseries: 2,
      playAreas: 3,
      safetyPerception: 'medium'
    },
    futureGrowth: {
      dubai2040Impact: 'high',
      upcomingProjects: ['The Pulse by Dubai South', 'Expo City Dubai transformation', 'Al Maktoum Airport expansion'],
      infrastructurePlanned: ['Al Maktoum International Airport expansion', 'Route 2020 extensions'],
      completionStatus: 0.3
    },
    tags: ['emerging', 'airport-city', 'expo', 'affordable', 'high-growth', 'new'],
    description: 'The master-planned city around Al Maktoum International Airport and Expo City Dubai, offering affordable entry into what\'s projected to become Dubai\'s second downtown.'
  },
  {
    id: 'town-square',
    name: 'Town Square',
    developer: 'Nshama',
    status: 'established',
    freeholdStatus: 'freehold',
    propertyTypes: ['apartment', 'townhouse'],
    pricing: {
      pricePerSqft: {
        min: 700,
        max: 1000
      },
      priceRangeAed: [300000, 2500000],
      priceChangeYoY: {
        min: 10,
        max: 16
      },
      transactionVolume12m: '3000-4000',
      serviceChargePerSqft: {
        min: 7,
        max: 11
      }
    },
    investment: {
      rentalYieldPct: {
        min: 6.5,
        max: 8.5
      },
      demandLevel: 'medium',
      capitalAppreciation3y: {
        min: 20,
        max: 32
      }
    },
    connectivity: {
      nearestMetro: {
        name: 'Mall of the Emirates',
        distanceKm: 15
      },
      upcomingMetro: null,
      commuteMinutes: {
        difc: 30,
        businessBay: 28,
        marina: 25,
        airport: 35
      },
      walkabilityScore: 4
    },
    livability: {
      nearbyMalls: ['Town Square Retail'],
      nearbyHospitals: ['Aster Clinic'],
      nearbySupermarkets: ['Carrefour Market', 'Choithrams'],
      nearbyParks: ['Town Square Park', 'Central Plaza'],
      beachDistanceKm: 25,
      noiseLevel: 'low',
      petFriendly: true,
      communityFeel: 'affordable-community'
    },
    familyFriendliness: {
      schools: [
        {
          name: 'GEMS Founders School Al Barsha South',
          rating: 'Good',
          curriculum: 'US',
          distanceKm: 5
        },
        {
          name: 'Sunmarke School',
          rating: 'Very Good',
          curriculum: 'UK/IB',
          distanceKm: 8
        }
      ],
      nearbyNurseries: 3,
      playAreas: 5,
      safetyPerception: 'high'
    },
    futureGrowth: {
      dubai2040Impact: 'medium',
      upcomingProjects: ['Town Square Phase 3 towers'],
      infrastructurePlanned: [],
      completionStatus: 0.7
    },
    tags: ['affordable', 'family', 'first-home', 'community-feel', 'high-yield'],
    description: 'Nshama\'s affordable master-planned community offering budget-friendly apartments and townhouses with a strong community vibe, ideal for first-time buyers.'
  },
  {
    id: 'mudon',
    name: 'Mudon',
    developer: 'Dubai Properties',
    status: 'established',
    freeholdStatus: 'freehold',
    propertyTypes: ['villa', 'townhouse'],
    pricing: {
      pricePerSqft: {
        min: 900,
        max: 1300
      },
      priceRangeAed: [1800000, 6000000],
      priceChangeYoY: {
        min: 7,
        max: 12
      },
      transactionVolume12m: '1500-2000',
      serviceChargePerSqft: {
        min: 4,
        max: 6
      }
    },
    investment: {
      rentalYieldPct: {
        min: 5.0,
        max: 6.5
      },
      demandLevel: 'medium',
      capitalAppreciation3y: {
        min: 18,
        max: 28
      }
    },
    connectivity: {
      nearestMetro: {
        name: 'Mall of the Emirates',
        distanceKm: 14
      },
      upcomingMetro: null,
      commuteMinutes: {
        difc: 28,
        businessBay: 25,
        marina: 22,
        airport: 32
      },
      walkabilityScore: 3
    },
    livability: {
      nearbyMalls: ['Mudon Central Park Retail'],
      nearbyHospitals: ['Mediclinic Parkview Hospital'],
      nearbySupermarkets: ['Spinneys', 'Carrefour Market'],
      nearbyParks: ['Mudon Central Park'],
      beachDistanceKm: 24,
      noiseLevel: 'low',
      petFriendly: true,
      communityFeel: 'quiet-villa-community'
    },
    familyFriendliness: {
      schools: [
        {
          name: 'GEMS Founders School',
          rating: 'Good',
          curriculum: 'US',
          distanceKm: 4
        },
        {
          name: 'Sunmarke School',
          rating: 'Very Good',
          curriculum: 'UK/IB',
          distanceKm: 6
        }
      ],
      nearbyNurseries: 2,
      playAreas: 5,
      safetyPerception: 'high'
    },
    futureGrowth: {
      dubai2040Impact: 'medium',
      upcomingProjects: ['Mudon Views Phase 2'],
      infrastructurePlanned: [],
      completionStatus: 0.9
    },
    tags: ['family', 'villa-community', 'quiet', 'value', 'suburban'],
    description: 'A well-established villa community by Dubai Properties offering quiet family living with a central park and community amenities at mid-range prices.'
  },
  {
    id: 'remraam',
    name: 'Remraam',
    developer: 'Dubai Properties',
    status: 'established',
    freeholdStatus: 'freehold',
    propertyTypes: ['apartment', 'townhouse'],
    pricing: {
      pricePerSqft: {
        min: 600,
        max: 850
      },
      priceRangeAed: [280000, 1200000],
      priceChangeYoY: {
        min: 10,
        max: 16
      },
      transactionVolume12m: '800-1200',
      serviceChargePerSqft: {
        min: 6,
        max: 9
      }
    },
    investment: {
      rentalYieldPct: {
        min: 7.0,
        max: 9.5
      },
      demandLevel: 'medium',
      capitalAppreciation3y: {
        min: 18,
        max: 28
      }
    },
    connectivity: {
      nearestMetro: {
        name: 'Mall of the Emirates',
        distanceKm: 12
      },
      upcomingMetro: null,
      commuteMinutes: {
        difc: 28,
        businessBay: 25,
        marina: 22,
        airport: 32
      },
      walkabilityScore: 3
    },
    livability: {
      nearbyMalls: ['Dubai Outlet Mall'],
      nearbyHospitals: ['Mediclinic Parkview Hospital'],
      nearbySupermarkets: ['Carrefour Market', 'West Zone'],
      nearbyParks: ['Remraam Community Park'],
      beachDistanceKm: 24,
      noiseLevel: 'low',
      petFriendly: true,
      communityFeel: 'quiet-affordable'
    },
    familyFriendliness: {
      schools: [
        {
          name: 'GEMS Founders School',
          rating: 'Good',
          curriculum: 'US',
          distanceKm: 5
        },
        {
          name: 'Sunmarke School',
          rating: 'Very Good',
          curriculum: 'UK/IB',
          distanceKm: 7
        }
      ],
      nearbyNurseries: 2,
      playAreas: 3,
      safetyPerception: 'high'
    },
    futureGrowth: {
      dubai2040Impact: 'low',
      upcomingProjects: [],
      infrastructurePlanned: [],
      completionStatus: 1.0
    },
    tags: ['budget', 'quiet', 'high-yield', 'family', 'value'],
    description: 'A low-rise affordable community near Dubailand offering excellent rental yields and quiet family living, popular with budget-conscious families and investors.'
  },
  {
    id: 'mirdif',
    name: 'Mirdif',
    developer: 'Various (Government / Private)',
    status: 'established',
    freeholdStatus: 'leasehold',
    propertyTypes: ['villa', 'townhouse', 'apartment'],
    pricing: {
      pricePerSqft: {
        min: 800,
        max: 1200
      },
      priceRangeAed: [600000, 5000000],
      priceChangeYoY: {
        min: 5,
        max: 10
      },
      transactionVolume12m: '1000-1500',
      serviceChargePerSqft: {
        min: 3,
        max: 6
      }
    },
    investment: {
      rentalYieldPct: {
        min: 4.5,
        max: 6.0
      },
      demandLevel: 'medium',
      capitalAppreciation3y: {
        min: 12,
        max: 20
      }
    },
    connectivity: {
      nearestMetro: {
        name: 'Rashidiya',
        distanceKm: 5
      },
      upcomingMetro: null,
      commuteMinutes: {
        difc: 25,
        businessBay: 22,
        marina: 35,
        airport: 10
      },
      walkabilityScore: 4
    },
    livability: {
      nearbyMalls: ['City Centre Mirdif', 'Mirdif City Centre'],
      nearbyHospitals: ['Medcare Hospital', 'Fakeeh University Hospital'],
      nearbySupermarkets: ['Carrefour', 'Spinneys', 'Union Coop'],
      nearbyParks: ['Mushrif Park', 'Uptown Mirdif Park'],
      beachDistanceKm: 15,
      noiseLevel: 'low',
      petFriendly: true,
      communityFeel: 'established-family-suburb'
    },
    familyFriendliness: {
      schools: [
        {
          name: 'Uptown School',
          rating: 'Outstanding',
          curriculum: 'IB',
          distanceKm: 1
        },
        {
          name: 'Star International School Mirdif',
          rating: 'Very Good',
          curriculum: 'UK',
          distanceKm: 2
        }
      ],
      nearbyNurseries: 8,
      playAreas: 7,
      safetyPerception: 'high'
    },
    futureGrowth: {
      dubai2040Impact: 'medium',
      upcomingProjects: ['Mirdif Hills Phase 2'],
      infrastructurePlanned: [],
      completionStatus: 0.95
    },
    tags: ['family', 'established', 'schools', 'leasehold', 'quiet', 'suburban'],
    description: 'One of Dubai\'s most established family neighborhoods with outstanding schools, Mushrif Park, and City Centre Mirdif—primarily leasehold but highly sought-after by families.'
  },
  {
    id: 'al-barsha',
    name: 'Al Barsha',
    developer: 'Various (Government)',
    status: 'established',
    freeholdStatus: 'leasehold',
    propertyTypes: ['apartment', 'villa'],
    pricing: {
      pricePerSqft: {
        min: 900,
        max: 1400
      },
      priceRangeAed: [400000, 6000000],
      priceChangeYoY: {
        min: 5,
        max: 10
      },
      transactionVolume12m: '1500-2000',
      serviceChargePerSqft: {
        min: 8,
        max: 14
      }
    },
    investment: {
      rentalYieldPct: {
        min: 5.0,
        max: 7.0
      },
      demandLevel: 'medium',
      capitalAppreciation3y: {
        min: 12,
        max: 22
      }
    },
    connectivity: {
      nearestMetro: {
        name: 'Mall of the Emirates',
        distanceKm: 0.5
      },
      upcomingMetro: null,
      commuteMinutes: {
        difc: 18,
        businessBay: 16,
        marina: 10,
        airport: 25
      },
      walkabilityScore: 6
    },
    livability: {
      nearbyMalls: ['Mall of the Emirates', 'My City Centre Al Barsha'],
      nearbyHospitals: ['Saudi German Hospital', 'Al Zahra Hospital'],
      nearbySupermarkets: ['Carrefour', 'Spinneys', 'West Zone'],
      nearbyParks: ['Al Barsha Pond Park', 'Al Barsha Park'],
      beachDistanceKm: 5,
      noiseLevel: 'moderate',
      petFriendly: true,
      communityFeel: 'central-residential'
    },
    familyFriendliness: {
      schools: [
        {
          name: 'Kings\' School Al Barsha',
          rating: 'Outstanding',
          curriculum: 'UK',
          distanceKm: 1
        },
        {
          name: 'American School of Dubai',
          rating: 'Outstanding',
          curriculum: 'US',
          distanceKm: 2
        }
      ],
      nearbyNurseries: 10,
      playAreas: 5,
      safetyPerception: 'high'
    },
    futureGrowth: {
      dubai2040Impact: 'medium',
      upcomingProjects: [],
      infrastructurePlanned: [],
      completionStatus: 1.0
    },
    tags: ['central', 'metro-connected', 'schools', 'mall-access', 'established'],
    description: 'A central residential area anchored by Mall of the Emirates with metro access, outstanding schools, and a mix of villas and apartments—primarily leasehold.'
  },
  {
    id: 'jvt',
    name: 'JVT',
    developer: 'Nakheel',
    status: 'established',
    freeholdStatus: 'freehold',
    propertyTypes: ['apartment', 'villa', 'townhouse'],
    pricing: {
      pricePerSqft: {
        min: 850,
        max: 1300
      },
      priceRangeAed: [350000, 5000000],
      priceChangeYoY: {
        min: 9,
        max: 15
      },
      transactionVolume12m: '2000-2800',
      serviceChargePerSqft: {
        min: 6,
        max: 10
      }
    },
    investment: {
      rentalYieldPct: {
        min: 6.5,
        max: 8.5
      },
      demandLevel: 'high',
      capitalAppreciation3y: {
        min: 22,
        max: 34
      }
    },
    connectivity: {
      nearestMetro: {
        name: 'DMCC',
        distanceKm: 4
      },
      upcomingMetro: null,
      commuteMinutes: {
        difc: 25,
        businessBay: 22,
        marina: 10,
        airport: 32
      },
      walkabilityScore: 3
    },
    livability: {
      nearbyMalls: ['Circle Mall', 'Ibn Battuta Mall'],
      nearbyHospitals: ['NMC Royal Hospital'],
      nearbySupermarkets: ['Spinneys', 'Carrefour Market', 'West Zone'],
      nearbyParks: ['JVT Park', 'Community Green Areas'],
      beachDistanceKm: 14,
      noiseLevel: 'low',
      petFriendly: true,
      communityFeel: 'quiet-family-village'
    },
    familyFriendliness: {
      schools: [
        {
          name: 'JSS International School',
          rating: 'Good',
          curriculum: 'Indian',
          distanceKm: 2
        },
        {
          name: 'Sunmarke School',
          rating: 'Very Good',
          curriculum: 'UK/IB',
          distanceKm: 4
        }
      ],
      nearbyNurseries: 5,
      playAreas: 5,
      safetyPerception: 'high'
    },
    futureGrowth: {
      dubai2040Impact: 'medium',
      upcomingProjects: ['JVT District expansion'],
      infrastructurePlanned: [],
      completionStatus: 0.88
    },
    tags: ['family', 'value', 'high-yield', 'quiet', 'green'],
    description: 'A quieter alternative to JVC with a village-like feel, offering freehold villas, townhouses, and apartments with strong yields and family-friendly green spaces.'
  },
  {
    id: 'bluewaters-island',
    name: 'Bluewaters Island',
    developer: 'Meraas',
    status: 'established',
    freeholdStatus: 'freehold',
    propertyTypes: ['apartment', 'penthouse'],
    pricing: {
      pricePerSqft: {
        min: 2500,
        max: 3800
      },
      priceRangeAed: [2000000, 35000000],
      priceChangeYoY: {
        min: 8,
        max: 14
      },
      transactionVolume12m: '300-500',
      serviceChargePerSqft: {
        min: 22,
        max: 35
      }
    },
    investment: {
      rentalYieldPct: {
        min: 4.5,
        max: 5.5
      },
      demandLevel: 'high',
      capitalAppreciation3y: {
        min: 25,
        max: 35
      }
    },
    connectivity: {
      nearestMetro: {
        name: 'DMCC',
        distanceKm: 2
      },
      upcomingMetro: null,
      commuteMinutes: {
        difc: 22,
        businessBay: 20,
        marina: 5,
        airport: 32
      },
      walkabilityScore: 7
    },
    livability: {
      nearbyMalls: ['The Beach JBR', 'Dubai Marina Mall'],
      nearbyHospitals: ['Mediclinic Dubai Marina'],
      nearbySupermarkets: ['Spinneys', 'Waitrose'],
      nearbyParks: ['Ain Dubai Promenade', 'Bluewaters Beach'],
      beachDistanceKm: 0.1,
      noiseLevel: 'low',
      petFriendly: true,
      communityFeel: 'exclusive-island-resort'
    },
    familyFriendliness: {
      schools: [
        {
          name: 'Dubai British School Jumeirah Park',
          rating: 'Very Good',
          curriculum: 'UK',
          distanceKm: 6
        },
        {
          name: 'Kings\' School Al Barsha',
          rating: 'Outstanding',
          curriculum: 'UK',
          distanceKm: 7
        }
      ],
      nearbyNurseries: 1,
      playAreas: 2,
      safetyPerception: 'high'
    },
    futureGrowth: {
      dubai2040Impact: 'medium',
      upcomingProjects: [],
      infrastructurePlanned: [],
      completionStatus: 1.0
    },
    tags: ['ultra-luxury', 'island', 'beachfront', 'ain-dubai', 'exclusive'],
    description: 'An exclusive island development by Meraas home to Ain Dubai, offering ultra-premium beachfront residences with resort-style living and panoramic sea views.'
  },
  {
    id: 'city-walk',
    name: 'City Walk',
    developer: 'Meraas',
    status: 'established',
    freeholdStatus: 'freehold',
    propertyTypes: ['apartment', 'penthouse'],
    pricing: {
      pricePerSqft: {
        min: 2200,
        max: 3200
      },
      priceRangeAed: [1500000, 25000000],
      priceChangeYoY: {
        min: 8,
        max: 13
      },
      transactionVolume12m: '500-800',
      serviceChargePerSqft: {
        min: 20,
        max: 30
      }
    },
    investment: {
      rentalYieldPct: {
        min: 4.5,
        max: 5.8
      },
      demandLevel: 'high',
      capitalAppreciation3y: {
        min: 22,
        max: 32
      }
    },
    connectivity: {
      nearestMetro: {
        name: 'Business Bay',
        distanceKm: 2
      },
      upcomingMetro: null,
      commuteMinutes: {
        difc: 8,
        businessBay: 5,
        marina: 20,
        airport: 14
      },
      walkabilityScore: 9
    },
    livability: {
      nearbyMalls: ['City Walk Retail', 'Box Park'],
      nearbyHospitals: ['Mediclinic City Hospital'],
      nearbySupermarkets: ['Waitrose', 'Carrefour'],
      nearbyParks: ['Green Planet', 'City Walk Promenade'],
      beachDistanceKm: 5,
      noiseLevel: 'moderate',
      petFriendly: true,
      communityFeel: 'urban-chic'
    },
    familyFriendliness: {
      schools: [
        {
          name: 'JSS International School',
          rating: 'Good',
          curriculum: 'Indian',
          distanceKm: 2
        },
        {
          name: 'GEMS Wellington Primary School',
          rating: 'Very Good',
          curriculum: 'UK',
          distanceKm: 3
        }
      ],
      nearbyNurseries: 4,
      playAreas: 3,
      safetyPerception: 'high'
    },
    futureGrowth: {
      dubai2040Impact: 'high',
      upcomingProjects: ['City Walk Phase 3'],
      infrastructurePlanned: [],
      completionStatus: 0.85
    },
    tags: ['urban', 'walkable', 'dining', 'luxury', 'retail-hub'],
    description: 'Meraas\'s upscale urban lifestyle destination with designer retail, al fresco dining, and premium residences in a highly walkable setting near Downtown.'
  },
  {
    id: 'tilal-al-ghaf',
    name: 'Tilal Al Ghaf',
    developer: 'Majid Al Futtaim',
    status: 'new',
    freeholdStatus: 'freehold',
    propertyTypes: ['villa', 'townhouse'],
    pricing: {
      pricePerSqft: {
        min: 1400,
        max: 2200
      },
      priceRangeAed: [2500000, 18000000],
      priceChangeYoY: {
        min: 15,
        max: 25
      },
      transactionVolume12m: '2000-2800',
      serviceChargePerSqft: {
        min: 6,
        max: 10
      }
    },
    investment: {
      rentalYieldPct: {
        min: 4.5,
        max: 6.0
      },
      demandLevel: 'high',
      capitalAppreciation3y: {
        min: 35,
        max: 55
      }
    },
    connectivity: {
      nearestMetro: {
        name: 'Mall of the Emirates',
        distanceKm: 10
      },
      upcomingMetro: null,
      commuteMinutes: {
        difc: 25,
        businessBay: 22,
        marina: 18,
        airport: 30
      },
      walkabilityScore: 4
    },
    livability: {
      nearbyMalls: ['Mall of the Emirates', 'First Avenue Mall'],
      nearbyHospitals: ['Mediclinic Parkview Hospital'],
      nearbySupermarkets: ['Carrefour Market'],
      nearbyParks: ['Crystal Lagoon', 'Tilal Al Ghaf Parks'],
      beachDistanceKm: 18,
      noiseLevel: 'low',
      petFriendly: true,
      communityFeel: 'premium-lagoon-community'
    },
    familyFriendliness: {
      schools: [
        {
          name: 'GEMS Al Barsha National School',
          rating: 'Good',
          curriculum: 'US',
          distanceKm: 5
        },
        {
          name: 'Sunmarke School',
          rating: 'Very Good',
          curriculum: 'UK/IB',
          distanceKm: 6
        }
      ],
      nearbyNurseries: 2,
      playAreas: 8,
      safetyPerception: 'high'
    },
    futureGrowth: {
      dubai2040Impact: 'high',
      upcomingProjects: ['Serenity Villas Phase 3', 'Harmony Villas', 'Community Lagoon expansion'],
      infrastructurePlanned: ['New road access from Al Khail'],
      completionStatus: 0.35
    },
    tags: ['premium', 'lagoon', 'new-launch', 'family', 'master-planned', 'high-growth'],
    description: 'Majid Al Futtaim\'s flagship master-planned lagoon community featuring crystal-clear swimming lagoons, premium villas, and strong early appreciation—one of Dubai\'s hottest new launches.'
  },
  {
    id: 'the-valley',
    name: 'The Valley',
    developer: 'Emaar Properties',
    status: 'new',
    freeholdStatus: 'freehold',
    propertyTypes: ['villa', 'townhouse'],
    pricing: {
      pricePerSqft: {
        min: 900,
        max: 1300
      },
      priceRangeAed: [1500000, 5000000],
      priceChangeYoY: {
        min: 12,
        max: 20
      },
      transactionVolume12m: '2500-3500',
      serviceChargePerSqft: {
        min: 4,
        max: 7
      }
    },
    investment: {
      rentalYieldPct: {
        min: 5.0,
        max: 6.5
      },
      demandLevel: 'high',
      capitalAppreciation3y: {
        min: 25,
        max: 40
      }
    },
    connectivity: {
      nearestMetro: {
        name: 'Academic City (future)',
        distanceKm: 8
      },
      upcomingMetro: null,
      commuteMinutes: {
        difc: 30,
        businessBay: 28,
        marina: 35,
        airport: 22
      },
      walkabilityScore: 3
    },
    livability: {
      nearbyMalls: ['Town Centre (planned)'],
      nearbyHospitals: ['Planned community clinic'],
      nearbySupermarkets: ['Carrefour (planned)'],
      nearbyParks: ['The Valley Central Park', 'Sports Village'],
      beachDistanceKm: 28,
      noiseLevel: 'low',
      petFriendly: true,
      communityFeel: 'new-town-family'
    },
    familyFriendliness: {
      schools: [
        {
          name: 'GEMS Wellington Academy Silicon Oasis',
          rating: 'Very Good',
          curriculum: 'UK',
          distanceKm: 8
        },
        {
          name: 'Delhi Private School',
          rating: 'Good',
          curriculum: 'Indian',
          distanceKm: 9
        }
      ],
      nearbyNurseries: 1,
      playAreas: 5,
      safetyPerception: 'high'
    },
    futureGrowth: {
      dubai2040Impact: 'high',
      upcomingProjects: ['The Valley Phase 2', 'Eden by Emaar', 'Town Centre'],
      infrastructurePlanned: ['New highway access', 'Community retail'],
      completionStatus: 0.3
    },
    tags: ['new-launch', 'affordable-villa', 'family', 'emerging', 'high-growth'],
    description: 'Emaar\'s ambitious new town offering affordable villas and townhouses with a planned town centre, positioned along the Dubai-Al Ain road with significant growth potential.'
  },
  {
    id: 'dubai-investment-park',
    name: 'Dubai Investment Park',
    developer: 'Dubai Investments',
    status: 'established',
    freeholdStatus: 'freehold',
    propertyTypes: ['apartment', 'villa', 'townhouse'],
    pricing: {
      pricePerSqft: {
        min: 500,
        max: 800
      },
      priceRangeAed: [200000, 2500000],
      priceChangeYoY: {
        min: 8,
        max: 14
      },
      transactionVolume12m: '1500-2200',
      serviceChargePerSqft: {
        min: 5,
        max: 9
      }
    },
    investment: {
      rentalYieldPct: {
        min: 7.5,
        max: 10.0
      },
      demandLevel: 'medium',
      capitalAppreciation3y: {
        min: 15,
        max: 25
      }
    },
    connectivity: {
      nearestMetro: {
        name: 'Expo 2020 / Route 2020',
        distanceKm: 5
      },
      upcomingMetro: null,
      commuteMinutes: {
        difc: 32,
        businessBay: 30,
        marina: 22,
        airport: 40
      },
      walkabilityScore: 2
    },
    livability: {
      nearbyMalls: ['Ibn Battuta Mall'],
      nearbyHospitals: ['NMC Hospital DIP'],
      nearbySupermarkets: ['Carrefour', 'Nesto', 'West Zone'],
      nearbyParks: ['DIP Central Park'],
      beachDistanceKm: 18,
      noiseLevel: 'moderate',
      petFriendly: false,
      communityFeel: 'mixed-use-industrial'
    },
    familyFriendliness: {
      schools: [
        {
          name: 'Greenfield Community School',
          rating: 'Good',
          curriculum: 'IB',
          distanceKm: 4
        },
        {
          name: 'The Winchester School',
          rating: 'Good',
          curriculum: 'Indian',
          distanceKm: 5
        }
      ],
      nearbyNurseries: 3,
      playAreas: 2,
      safetyPerception: 'medium'
    },
    futureGrowth: {
      dubai2040Impact: 'medium',
      upcomingProjects: ['DIP residential expansion'],
      infrastructurePlanned: ['Expo Road connectivity'],
      completionStatus: 0.9
    },
    tags: ['budget', 'industrial', 'high-yield', 'mixed-use', 'value'],
    description: 'A mixed-use zone combining industrial, commercial, and residential areas with very affordable housing and strong yields, suited for budget investors.'
  },
  {
    id: 'production-city',
    name: 'Production City',
    developer: 'TECOM Group',
    status: 'established',
    freeholdStatus: 'freehold',
    propertyTypes: ['apartment'],
    pricing: {
      pricePerSqft: {
        min: 550,
        max: 850
      },
      priceRangeAed: [220000, 800000],
      priceChangeYoY: {
        min: 10,
        max: 16
      },
      transactionVolume12m: '2000-2800',
      serviceChargePerSqft: {
        min: 8,
        max: 13
      }
    },
    investment: {
      rentalYieldPct: {
        min: 7.5,
        max: 10.0
      },
      demandLevel: 'medium',
      capitalAppreciation3y: {
        min: 18,
        max: 28
      }
    },
    connectivity: {
      nearestMetro: {
        name: 'Ibn Battuta',
        distanceKm: 5
      },
      upcomingMetro: null,
      commuteMinutes: {
        difc: 30,
        businessBay: 28,
        marina: 15,
        airport: 35
      },
      walkabilityScore: 3
    },
    livability: {
      nearbyMalls: ['Ibn Battuta Mall'],
      nearbyHospitals: ['NMC Royal Hospital'],
      nearbySupermarkets: ['Carrefour Market', 'West Zone'],
      nearbyParks: ['Production City Park'],
      beachDistanceKm: 12,
      noiseLevel: 'moderate',
      petFriendly: false,
      communityFeel: 'media-zone'
    },
    familyFriendliness: {
      schools: [
        {
          name: 'The Winchester School',
          rating: 'Good',
          curriculum: 'Indian',
          distanceKm: 3
        },
        {
          name: 'Arcadia School',
          rating: 'Good',
          curriculum: 'UK',
          distanceKm: 5
        }
      ],
      nearbyNurseries: 3,
      playAreas: 2,
      safetyPerception: 'medium'
    },
    futureGrowth: {
      dubai2040Impact: 'medium',
      upcomingProjects: ['New residential towers'],
      infrastructurePlanned: [],
      completionStatus: 0.9
    },
    tags: ['budget', 'media-zone', 'high-yield', 'value'],
    description: 'Formerly IMPZ, a free zone media cluster offering very affordable apartments with some of the highest rental yields in Dubai.'
  },
  {
    id: 'studio-city',
    name: 'Studio City',
    developer: 'TECOM Group / Various',
    status: 'established',
    freeholdStatus: 'freehold',
    propertyTypes: ['apartment'],
    pricing: {
      pricePerSqft: {
        min: 900,
        max: 1400
      },
      priceRangeAed: [400000, 3000000],
      priceChangeYoY: {
        min: 8,
        max: 14
      },
      transactionVolume12m: '2500-3500',
      serviceChargePerSqft: {
        min: 10,
        max: 16
      }
    },
    investment: {
      rentalYieldPct: {
        min: 6.5,
        max: 8.5
      },
      demandLevel: 'medium',
      capitalAppreciation3y: {
        min: 20,
        max: 30
      }
    },
    connectivity: {
      nearestMetro: {
        name: 'Mall of the Emirates',
        distanceKm: 8
      },
      upcomingMetro: null,
      commuteMinutes: {
        difc: 22,
        businessBay: 20,
        marina: 15,
        airport: 28
      },
      walkabilityScore: 4
    },
    livability: {
      nearbyMalls: ['First Avenue Mall', 'Studio City Retail'],
      nearbyHospitals: ['Mediclinic Parkview Hospital'],
      nearbySupermarkets: ['Carrefour Market', 'Spinneys'],
      nearbyParks: ['Studio City Green Spine'],
      beachDistanceKm: 18,
      noiseLevel: 'low',
      petFriendly: true,
      communityFeel: 'modern-creative'
    },
    familyFriendliness: {
      schools: [
        {
          name: 'Nord Anglia International School',
          rating: 'Very Good',
          curriculum: 'IB',
          distanceKm: 2
        },
        {
          name: 'GEMS United School',
          rating: 'Good',
          curriculum: 'UK',
          distanceKm: 3
        }
      ],
      nearbyNurseries: 4,
      playAreas: 4,
      safetyPerception: 'high'
    },
    futureGrowth: {
      dubai2040Impact: 'medium',
      upcomingProjects: ['Studio City Phase 2 towers'],
      infrastructurePlanned: [],
      completionStatus: 0.75
    },
    tags: ['modern', 'creative', 'value', 'high-yield', 'family'],
    description: 'A media and entertainment-themed community near DAMAC Hills offering modern apartments with good yields and a creative, laid-back atmosphere.'
  },
  {
    id: 'jumeirah',
    name: 'Jumeirah',
    developer: 'Various (Government)',
    status: 'established',
    freeholdStatus: 'leasehold',
    propertyTypes: ['villa'],
    pricing: {
      pricePerSqft: {
        min: 1500,
        max: 2500
      },
      priceRangeAed: [5000000, 30000000],
      priceChangeYoY: {
        min: 5,
        max: 10
      },
      transactionVolume12m: '400-600',
      serviceChargePerSqft: {
        min: 2,
        max: 4
      }
    },
    investment: {
      rentalYieldPct: {
        min: 3.5,
        max: 4.5
      },
      demandLevel: 'medium',
      capitalAppreciation3y: {
        min: 15,
        max: 25
      }
    },
    connectivity: {
      nearestMetro: {
        name: 'World Trade Centre',
        distanceKm: 4
      },
      upcomingMetro: null,
      commuteMinutes: {
        difc: 12,
        businessBay: 10,
        marina: 20,
        airport: 15
      },
      walkabilityScore: 5
    },
    livability: {
      nearbyMalls: ['Mercato Mall', 'City Walk', 'Box Park'],
      nearbyHospitals: ['Mediclinic City Hospital', 'Iranian Hospital'],
      nearbySupermarkets: ['Spinneys', 'Waitrose', 'Choithrams'],
      nearbyParks: ['Jumeirah Beach Park', 'Safa Park'],
      beachDistanceKm: 0.3,
      noiseLevel: 'low',
      petFriendly: true,
      communityFeel: 'premium-beachside-residential'
    },
    familyFriendliness: {
      schools: [
        {
          name: 'Jumeirah College',
          rating: 'Outstanding',
          curriculum: 'UK',
          distanceKm: 1
        },
        {
          name: 'GEMS Jumeirah Primary School',
          rating: 'Outstanding',
          curriculum: 'UK',
          distanceKm: 2
        }
      ],
      nearbyNurseries: 6,
      playAreas: 5,
      safetyPerception: 'high'
    },
    futureGrowth: {
      dubai2040Impact: 'medium',
      upcomingProjects: [],
      infrastructurePlanned: [],
      completionStatus: 1.0
    },
    tags: ['premium', 'beachside', 'villa', 'established', 'schools', 'leasehold'],
    description: 'Dubai\'s prestigious beachside residential strip home to the Jumeirah Mosque and outstanding schools, offering large villas in a quiet, leafy setting—primarily leasehold.'
  },
  {
    id: 'umm-suqeim',
    name: 'Umm Suqeim',
    developer: 'Various (Government)',
    status: 'established',
    freeholdStatus: 'leasehold',
    propertyTypes: ['villa'],
    pricing: {
      pricePerSqft: {
        min: 1400,
        max: 2200
      },
      priceRangeAed: [4000000, 20000000],
      priceChangeYoY: {
        min: 5,
        max: 10
      },
      transactionVolume12m: '300-500',
      serviceChargePerSqft: {
        min: 2,
        max: 4
      }
    },
    investment: {
      rentalYieldPct: {
        min: 3.5,
        max: 4.5
      },
      demandLevel: 'medium',
      capitalAppreciation3y: {
        min: 12,
        max: 22
      }
    },
    connectivity: {
      nearestMetro: {
        name: 'Mall of the Emirates',
        distanceKm: 1.5
      },
      upcomingMetro: null,
      commuteMinutes: {
        difc: 18,
        businessBay: 16,
        marina: 8,
        airport: 25
      },
      walkabilityScore: 5
    },
    livability: {
      nearbyMalls: ['Mall of the Emirates', 'Kite Beach Retail'],
      nearbyHospitals: ['Saudi German Hospital', 'Al Zahra Hospital'],
      nearbySupermarkets: ['Spinneys', 'Choithrams', 'Union Coop'],
      nearbyParks: ['Kite Beach', 'Umm Suqeim Park'],
      beachDistanceKm: 0.5,
      noiseLevel: 'low',
      petFriendly: true,
      communityFeel: 'quiet-beachside'
    },
    familyFriendliness: {
      schools: [
        {
          name: 'Dubai College',
          rating: 'Outstanding',
          curriculum: 'UK',
          distanceKm: 2
        },
        {
          name: 'Kings\' School Al Barsha',
          rating: 'Outstanding',
          curriculum: 'UK',
          distanceKm: 3
        }
      ],
      nearbyNurseries: 5,
      playAreas: 4,
      safetyPerception: 'high'
    },
    futureGrowth: {
      dubai2040Impact: 'medium',
      upcomingProjects: ['Madinat Jumeirah Living'],
      infrastructurePlanned: [],
      completionStatus: 1.0
    },
    tags: ['beachside', 'premium', 'quiet', 'kite-beach', 'leasehold'],
    description: 'A quiet beachside residential area near Kite Beach and Burj Al Arab, offering large villas with beach proximity and access to some of Dubai\'s best schools.'
  },
  {
    id: 'deira',
    name: 'Deira',
    developer: 'Various (Government / Older developers)',
    status: 'established',
    freeholdStatus: 'leasehold',
    propertyTypes: ['apartment'],
    pricing: {
      pricePerSqft: {
        min: 600,
        max: 1000
      },
      priceRangeAed: [250000, 2000000],
      priceChangeYoY: {
        min: 5,
        max: 10
      },
      transactionVolume12m: '2000-3000',
      serviceChargePerSqft: {
        min: 8,
        max: 14
      }
    },
    investment: {
      rentalYieldPct: {
        min: 6.5,
        max: 8.5
      },
      demandLevel: 'medium',
      capitalAppreciation3y: {
        min: 10,
        max: 18
      }
    },
    connectivity: {
      nearestMetro: {
        name: 'Deira City Centre',
        distanceKm: 0.5
      },
      upcomingMetro: null,
      commuteMinutes: {
        difc: 15,
        businessBay: 12,
        marina: 30,
        airport: 5
      },
      walkabilityScore: 7
    },
    livability: {
      nearbyMalls: ['Deira City Centre', 'Al Ghurair Centre'],
      nearbyHospitals: ['Al Maktoum Hospital', 'Dubai Hospital'],
      nearbySupermarkets: ['Carrefour', 'Lulu Hypermarket', 'Union Coop'],
      nearbyParks: ['Al Mamzar Beach Park', 'Creek Park'],
      beachDistanceKm: 3,
      noiseLevel: 'high',
      petFriendly: false,
      communityFeel: 'traditional-commercial'
    },
    familyFriendliness: {
      schools: [
        {
          name: 'Deira International School',
          rating: 'Good',
          curriculum: 'IB',
          distanceKm: 2
        },
        {
          name: 'The Indian High School',
          rating: 'Good',
          curriculum: 'Indian',
          distanceKm: 1
        }
      ],
      nearbyNurseries: 6,
      playAreas: 3,
      safetyPerception: 'medium'
    },
    futureGrowth: {
      dubai2040Impact: 'high',
      upcomingProjects: ['Deira Enrichment Project', 'Deira Islands'],
      infrastructurePlanned: ['Blue Line Metro', 'Creek crossing'],
      completionStatus: 0.95
    },
    tags: ['traditional', 'affordable', 'gold-souk', 'metro-connected', 'heritage'],
    description: 'Dubai\'s historic commercial heart featuring the Gold and Spice Souks, offering affordable living with excellent metro connectivity and proximity to the airport.'
  },
  {
    id: 'bur-dubai',
    name: 'Bur Dubai',
    developer: 'Various (Government)',
    status: 'established',
    freeholdStatus: 'leasehold',
    propertyTypes: ['apartment'],
    pricing: {
      pricePerSqft: {
        min: 700,
        max: 1100
      },
      priceRangeAed: [300000, 2500000],
      priceChangeYoY: {
        min: 5,
        max: 10
      },
      transactionVolume12m: '1800-2500',
      serviceChargePerSqft: {
        min: 8,
        max: 14
      }
    },
    investment: {
      rentalYieldPct: {
        min: 6.0,
        max: 8.0
      },
      demandLevel: 'medium',
      capitalAppreciation3y: {
        min: 10,
        max: 18
      }
    },
    connectivity: {
      nearestMetro: {
        name: 'BurJuman',
        distanceKm: 0.3
      },
      upcomingMetro: null,
      commuteMinutes: {
        difc: 10,
        businessBay: 8,
        marina: 25,
        airport: 12
      },
      walkabilityScore: 7
    },
    livability: {
      nearbyMalls: ['BurJuman Centre', 'Meena Bazaar'],
      nearbyHospitals: ['Aster Hospital', 'Belhoul Speciality Hospital'],
      nearbySupermarkets: ['Carrefour', 'Lulu Express', 'Choithrams'],
      nearbyParks: ['Creek Park', 'Bur Dubai Heritage Area'],
      beachDistanceKm: 8,
      noiseLevel: 'high',
      petFriendly: false,
      communityFeel: 'heritage-commercial'
    },
    familyFriendliness: {
      schools: [
        {
          name: 'Our Own English High School',
          rating: 'Good',
          curriculum: 'Indian',
          distanceKm: 1
        },
        {
          name: 'GEMS Our Own Indian School',
          rating: 'Good',
          curriculum: 'Indian',
          distanceKm: 2
        }
      ],
      nearbyNurseries: 5,
      playAreas: 3,
      safetyPerception: 'medium'
    },
    futureGrowth: {
      dubai2040Impact: 'high',
      upcomingProjects: ['Bur Dubai Waterfront Revitalization'],
      infrastructurePlanned: ['Creek crossing', 'Heritage district expansion'],
      completionStatus: 0.98
    },
    tags: ['heritage', 'affordable', 'metro-connected', 'central', 'multicultural'],
    description: 'Dubai\'s historic district along the Creek offering affordable leasehold apartments with excellent metro access, heritage charm, and a vibrant multicultural atmosphere.'
  },
  {
    id: 'the-springs',
    name: 'The Springs',
    developer: 'Emaar Properties',
    status: 'established',
    freeholdStatus: 'freehold',
    propertyTypes: ['villa', 'townhouse'],
    pricing: {
      pricePerSqft: {
        min: 1200,
        max: 1600
      },
      priceRangeAed: [2500000, 5500000],
      priceChangeYoY: {
        min: 6,
        max: 10
      },
      transactionVolume12m: '1500-2000',
      serviceChargePerSqft: {
        min: 4,
        max: 6
      }
    },
    investment: {
      rentalYieldPct: {
        min: 4.5,
        max: 5.5
      },
      demandLevel: 'high',
      capitalAppreciation3y: {
        min: 20,
        max: 28
      }
    },
    connectivity: {
      nearestMetro: {
        name: 'Nakheel',
        distanceKm: 3
      },
      upcomingMetro: null,
      commuteMinutes: {
        difc: 22,
        businessBay: 20,
        marina: 8,
        airport: 28
      },
      walkabilityScore: 3
    },
    livability: {
      nearbyMalls: ['Springs Souk', 'Emirates Hills Shopping Centre'],
      nearbyHospitals: ['Mediclinic Meadows'],
      nearbySupermarkets: ['Spinneys', 'Carrefour Market'],
      nearbyParks: ['Springs Community Park', 'Lake and Green Spaces'],
      beachDistanceKm: 10,
      noiseLevel: 'low',
      petFriendly: true,
      communityFeel: 'quiet-lakeside-family'
    },
    familyFriendliness: {
      schools: [
        {
          name: 'Emirates International School Meadows',
          rating: 'Very Good',
          curriculum: 'IB',
          distanceKm: 2
        },
        {
          name: 'Dubai British School Springs',
          rating: 'Good',
          curriculum: 'UK',
          distanceKm: 1
        }
      ],
      nearbyNurseries: 5,
      playAreas: 6,
      safetyPerception: 'high'
    },
    futureGrowth: {
      dubai2040Impact: 'low',
      upcomingProjects: [],
      infrastructurePlanned: [],
      completionStatus: 1.0
    },
    tags: ['family', 'lakeside', 'established', 'quiet', 'villa-community'],
    description: 'One of Emaar\'s earliest and most beloved villa communities featuring interconnected lakes, mature landscaping, and a tight-knit family community feel.'
  },
  {
    id: 'the-meadows',
    name: 'The Meadows',
    developer: 'Emaar Properties',
    status: 'established',
    freeholdStatus: 'freehold',
    propertyTypes: ['villa'],
    pricing: {
      pricePerSqft: {
        min: 1300,
        max: 1800
      },
      priceRangeAed: [4000000, 9000000],
      priceChangeYoY: {
        min: 6,
        max: 10
      },
      transactionVolume12m: '800-1200',
      serviceChargePerSqft: {
        min: 4,
        max: 6
      }
    },
    investment: {
      rentalYieldPct: {
        min: 4.0,
        max: 5.0
      },
      demandLevel: 'high',
      capitalAppreciation3y: {
        min: 20,
        max: 28
      }
    },
    connectivity: {
      nearestMetro: {
        name: 'Nakheel',
        distanceKm: 3.5
      },
      upcomingMetro: null,
      commuteMinutes: {
        difc: 22,
        businessBay: 20,
        marina: 10,
        airport: 28
      },
      walkabilityScore: 3
    },
    livability: {
      nearbyMalls: ['Emirates Hills Shopping Centre', 'Springs Souk'],
      nearbyHospitals: ['Mediclinic Meadows'],
      nearbySupermarkets: ['Spinneys', 'Choithrams'],
      nearbyParks: ['Meadows Village Park', 'Community Lakes'],
      beachDistanceKm: 10,
      noiseLevel: 'low',
      petFriendly: true,
      communityFeel: 'premium-family-lakeside'
    },
    familyFriendliness: {
      schools: [
        {
          name: 'Emirates International School Meadows',
          rating: 'Very Good',
          curriculum: 'IB',
          distanceKm: 1
        },
        {
          name: 'Dubai British School Springs',
          rating: 'Good',
          curriculum: 'UK',
          distanceKm: 2
        }
      ],
      nearbyNurseries: 4,
      playAreas: 5,
      safetyPerception: 'high'
    },
    futureGrowth: {
      dubai2040Impact: 'low',
      upcomingProjects: [],
      infrastructurePlanned: [],
      completionStatus: 1.0
    },
    tags: ['premium', 'family', 'lakeside', 'established', 'quiet'],
    description: 'A premium Emaar villa community adjacent to The Springs with larger plots, mature trees, and a serene lakeside setting—highly sought-after by established families.'
  },
  {
    id: 'jumeirah-park',
    name: 'Jumeirah Park',
    developer: 'Nakheel',
    status: 'established',
    freeholdStatus: 'freehold',
    propertyTypes: ['villa'],
    pricing: {
      pricePerSqft: {
        min: 1100,
        max: 1500
      },
      priceRangeAed: [3500000, 8000000],
      priceChangeYoY: {
        min: 7,
        max: 12
      },
      transactionVolume12m: '1000-1500',
      serviceChargePerSqft: {
        min: 3,
        max: 5
      }
    },
    investment: {
      rentalYieldPct: {
        min: 4.5,
        max: 5.5
      },
      demandLevel: 'high',
      capitalAppreciation3y: {
        min: 22,
        max: 30
      }
    },
    connectivity: {
      nearestMetro: {
        name: 'DMCC',
        distanceKm: 5
      },
      upcomingMetro: null,
      commuteMinutes: {
        difc: 25,
        businessBay: 22,
        marina: 10,
        airport: 30
      },
      walkabilityScore: 3
    },
    livability: {
      nearbyMalls: ['Circle Mall', 'Ibn Battuta Mall'],
      nearbyHospitals: ['NMC Royal Hospital'],
      nearbySupermarkets: ['Spinneys', 'Carrefour Market'],
      nearbyParks: ['Jumeirah Park Community Centre', 'District Parks'],
      beachDistanceKm: 10,
      noiseLevel: 'low',
      petFriendly: true,
      communityFeel: 'spacious-family-villa'
    },
    familyFriendliness: {
      schools: [
        {
          name: 'Dubai British School Jumeirah Park',
          rating: 'Very Good',
          curriculum: 'UK',
          distanceKm: 1
        },
        {
          name: 'Arcadia School',
          rating: 'Good',
          curriculum: 'UK',
          distanceKm: 3
        }
      ],
      nearbyNurseries: 5,
      playAreas: 7,
      safetyPerception: 'high'
    },
    futureGrowth: {
      dubai2040Impact: 'medium',
      upcomingProjects: ['Jumeirah Park Pavilion'],
      infrastructurePlanned: [],
      completionStatus: 0.95
    },
    tags: ['family', 'villa-community', 'spacious', 'green', 'value'],
    description: 'A Nakheel villa community known for its generous plot sizes and green landscaping, offering excellent value for families seeking spacious homes near the marina corridor.'
  },
  {
    id: 'al-barari',
    name: 'Al Barari',
    developer: 'Al Barari Group',
    status: 'established',
    freeholdStatus: 'freehold',
    propertyTypes: ['villa'],
    pricing: {
      pricePerSqft: {
        min: 1800,
        max: 3000
      },
      priceRangeAed: [8000000, 50000000],
      priceChangeYoY: {
        min: 5,
        max: 10
      },
      transactionVolume12m: '100-200',
      serviceChargePerSqft: {
        min: 6,
        max: 12
      }
    },
    investment: {
      rentalYieldPct: {
        min: 3.0,
        max: 4.0
      },
      demandLevel: 'medium',
      capitalAppreciation3y: {
        min: 15,
        max: 25
      }
    },
    connectivity: {
      nearestMetro: {
        name: 'Business Bay',
        distanceKm: 10
      },
      upcomingMetro: null,
      commuteMinutes: {
        difc: 20,
        businessBay: 18,
        marina: 22,
        airport: 22
      },
      walkabilityScore: 2
    },
    livability: {
      nearbyMalls: ['Dubai Hills Mall'],
      nearbyHospitals: ['Mediclinic Parkview Hospital'],
      nearbySupermarkets: ['Spinneys'],
      nearbyParks: ['Al Barari Botanical Gardens', 'Heart of Europe gardens'],
      beachDistanceKm: 20,
      noiseLevel: 'low',
      petFriendly: true,
      communityFeel: 'ultra-luxury-botanical'
    },
    familyFriendliness: {
      schools: [
        {
          name: 'Hartland International School',
          rating: 'Very Good',
          curriculum: 'UK',
          distanceKm: 5
        },
        {
          name: 'North London Collegiate School',
          rating: 'Outstanding',
          curriculum: 'UK',
          distanceKm: 6
        }
      ],
      nearbyNurseries: 1,
      playAreas: 3,
      safetyPerception: 'high'
    },
    futureGrowth: {
      dubai2040Impact: 'low',
      upcomingProjects: ['The Reserve Phase 2'],
      infrastructurePlanned: [],
      completionStatus: 0.9
    },
    tags: ['ultra-luxury', 'botanical', 'green', 'exclusive', 'nature'],
    description: 'Dubai\'s most exclusive botanical villa community with lush tropical gardens, waterfalls, and resort-sized plots—a haven for nature lovers seeking ultra-privacy.'
  },
  {
    id: 'la-mer',
    name: 'La Mer',
    developer: 'Meraas',
    status: 'established',
    freeholdStatus: 'freehold',
    propertyTypes: ['apartment', 'townhouse'],
    pricing: {
      pricePerSqft: {
        min: 2500,
        max: 3500
      },
      priceRangeAed: [2000000, 15000000],
      priceChangeYoY: {
        min: 8,
        max: 13
      },
      transactionVolume12m: '300-500',
      serviceChargePerSqft: {
        min: 20,
        max: 30
      }
    },
    investment: {
      rentalYieldPct: {
        min: 4.0,
        max: 5.5
      },
      demandLevel: 'high',
      capitalAppreciation3y: {
        min: 20,
        max: 30
      }
    },
    connectivity: {
      nearestMetro: {
        name: 'World Trade Centre',
        distanceKm: 5
      },
      upcomingMetro: null,
      commuteMinutes: {
        difc: 12,
        businessBay: 10,
        marina: 22,
        airport: 15
      },
      walkabilityScore: 7
    },
    livability: {
      nearbyMalls: ['La Mer South Retail', 'City Walk'],
      nearbyHospitals: ['Mediclinic City Hospital'],
      nearbySupermarkets: ['Spinneys', 'Waitrose'],
      nearbyParks: ['La Mer Beach', 'Laguna Waterpark'],
      beachDistanceKm: 0.05,
      noiseLevel: 'moderate',
      petFriendly: true,
      communityFeel: 'beachfront-lifestyle'
    },
    familyFriendliness: {
      schools: [
        {
          name: 'JSS International School',
          rating: 'Good',
          curriculum: 'Indian',
          distanceKm: 3
        },
        {
          name: 'Jumeirah College',
          rating: 'Outstanding',
          curriculum: 'UK',
          distanceKm: 4
        }
      ],
      nearbyNurseries: 3,
      playAreas: 4,
      safetyPerception: 'high'
    },
    futureGrowth: {
      dubai2040Impact: 'medium',
      upcomingProjects: ['La Mer Phase 3'],
      infrastructurePlanned: [],
      completionStatus: 0.85
    },
    tags: ['beachfront', 'lifestyle', 'dining', 'premium', 'walkable'],
    description: 'Meraas\'s hip beachfront destination featuring colorful retail, Laguna Waterpark, and premium residences with direct beach access in the heart of Jumeirah.'
  },
  {
    id: 'dubailand',
    name: 'Dubailand',
    developer: 'Various (Falcon City, Dubai Properties)',
    status: 'emerging',
    freeholdStatus: 'freehold',
    propertyTypes: ['villa', 'townhouse', 'apartment'],
    pricing: {
      pricePerSqft: {
        min: 600,
        max: 1000
      },
      priceRangeAed: [280000, 4000000],
      priceChangeYoY: {
        min: 10,
        max: 18
      },
      transactionVolume12m: '3000-4000',
      serviceChargePerSqft: {
        min: 5,
        max: 9
      }
    },
    investment: {
      rentalYieldPct: {
        min: 6.5,
        max: 9.0
      },
      demandLevel: 'medium',
      capitalAppreciation3y: {
        min: 20,
        max: 32
      }
    },
    connectivity: {
      nearestMetro: {
        name: 'Mall of the Emirates',
        distanceKm: 14
      },
      upcomingMetro: null,
      commuteMinutes: {
        difc: 28,
        businessBay: 25,
        marina: 25,
        airport: 30
      },
      walkabilityScore: 2
    },
    livability: {
      nearbyMalls: ['Dubai Outlet Mall', 'First Avenue Mall'],
      nearbyHospitals: ['Aster Clinic'],
      nearbySupermarkets: ['Carrefour Market', 'Nesto'],
      nearbyParks: ['Dubailand Community Parks'],
      beachDistanceKm: 25,
      noiseLevel: 'low',
      petFriendly: true,
      communityFeel: 'sprawling-suburban'
    },
    familyFriendliness: {
      schools: [
        {
          name: 'GEMS Founders School',
          rating: 'Good',
          curriculum: 'US',
          distanceKm: 4
        },
        {
          name: 'Sunmarke School',
          rating: 'Very Good',
          curriculum: 'UK/IB',
          distanceKm: 6
        }
      ],
      nearbyNurseries: 3,
      playAreas: 4,
      safetyPerception: 'medium'
    },
    futureGrowth: {
      dubai2040Impact: 'high',
      upcomingProjects: ['Falcon City of Wonders completion', 'Villanova expansion'],
      infrastructurePlanned: ['New road connections', 'Community centres'],
      completionStatus: 0.5
    },
    tags: ['affordable', 'emerging', 'villa', 'suburban', 'high-yield'],
    description: 'A sprawling master-development zone south of Arabian Ranches encompassing multiple sub-communities, offering affordable villas and strong growth potential.'
  },
  {
    id: 'dubai-media-city-area',
    name: 'Dubai Media City area',
    developer: 'TECOM Group',
    status: 'established',
    freeholdStatus: 'freehold',
    propertyTypes: ['apartment'],
    pricing: {
      pricePerSqft: {
        min: 1200,
        max: 1800
      },
      priceRangeAed: [500000, 5000000],
      priceChangeYoY: {
        min: 6,
        max: 11
      },
      transactionVolume12m: '1500-2000',
      serviceChargePerSqft: {
        min: 12,
        max: 18
      }
    },
    investment: {
      rentalYieldPct: {
        min: 6.0,
        max: 7.5
      },
      demandLevel: 'high',
      capitalAppreciation3y: {
        min: 18,
        max: 26
      }
    },
    connectivity: {
      nearestMetro: {
        name: 'Internet City',
        distanceKm: 0.5
      },
      upcomingMetro: null,
      commuteMinutes: {
        difc: 20,
        businessBay: 18,
        marina: 5,
        airport: 30
      },
      walkabilityScore: 6
    },
    livability: {
      nearbyMalls: ['Dubai Marina Mall', 'The Beach JBR'],
      nearbyHospitals: ['Saudi German Hospital', 'Mediclinic Dubai Marina'],
      nearbySupermarkets: ['Spinneys', 'Carrefour Market'],
      nearbyParks: ['Media City Amphitheatre', 'Barasti Beach area'],
      beachDistanceKm: 2,
      noiseLevel: 'moderate',
      petFriendly: true,
      communityFeel: 'tech-media-professional'
    },
    familyFriendliness: {
      schools: [
        {
          name: 'Dubai British School Jumeirah Park',
          rating: 'Very Good',
          curriculum: 'UK',
          distanceKm: 5
        },
        {
          name: 'Kings\' School Al Barsha',
          rating: 'Outstanding',
          curriculum: 'UK',
          distanceKm: 5
        }
      ],
      nearbyNurseries: 4,
      playAreas: 2,
      safetyPerception: 'high'
    },
    futureGrowth: {
      dubai2040Impact: 'medium',
      upcomingProjects: ['One at Palm Jumeirah by Omniyat (nearby)'],
      infrastructurePlanned: ['Tram extensions'],
      completionStatus: 0.95
    },
    tags: ['tech-hub', 'media', 'metro-connected', 'professional', 'beach-adjacent'],
    description: 'Dubai\'s media and tech free zone hub offering apartments popular with young professionals, with metro and tram access and proximity to the marina and beach.'
  },
  {
    id: 'dubai-knowledge-park',
    name: 'Dubai Knowledge Park',
    developer: 'TECOM Group',
    status: 'established',
    freeholdStatus: 'freehold',
    propertyTypes: ['apartment'],
    pricing: {
      pricePerSqft: {
        min: 1100,
        max: 1600
      },
      priceRangeAed: [450000, 3500000],
      priceChangeYoY: {
        min: 6,
        max: 10
      },
      transactionVolume12m: '800-1200',
      serviceChargePerSqft: {
        min: 12,
        max: 17
      }
    },
    investment: {
      rentalYieldPct: {
        min: 6.0,
        max: 7.5
      },
      demandLevel: 'medium',
      capitalAppreciation3y: {
        min: 16,
        max: 24
      }
    },
    connectivity: {
      nearestMetro: {
        name: 'Internet City',
        distanceKm: 1
      },
      upcomingMetro: null,
      commuteMinutes: {
        difc: 22,
        businessBay: 20,
        marina: 5,
        airport: 30
      },
      walkabilityScore: 5
    },
    livability: {
      nearbyMalls: ['Dubai Marina Mall'],
      nearbyHospitals: ['Saudi German Hospital'],
      nearbySupermarkets: ['Spinneys', 'Carrefour Market'],
      nearbyParks: ['Knowledge Park Green Area'],
      beachDistanceKm: 3,
      noiseLevel: 'moderate',
      petFriendly: true,
      communityFeel: 'educational-professional'
    },
    familyFriendliness: {
      schools: [
        {
          name: 'Dubai British School Jumeirah Park',
          rating: 'Very Good',
          curriculum: 'UK',
          distanceKm: 4
        },
        {
          name: 'American University in Dubai',
          rating: 'Very Good',
          curriculum: 'US',
          distanceKm: 1
        }
      ],
      nearbyNurseries: 3,
      playAreas: 2,
      safetyPerception: 'high'
    },
    futureGrowth: {
      dubai2040Impact: 'medium',
      upcomingProjects: [],
      infrastructurePlanned: [],
      completionStatus: 0.95
    },
    tags: ['education-hub', 'professional', 'metro-adjacent', 'value'],
    description: 'An education-focused free zone adjacent to Media City and Internet City, offering apartments popular with students and professionals near the marina corridor.'
  },
  {
    id: 'academic-city',
    name: 'Academic City',
    developer: 'Various (Government)',
    status: 'emerging',
    freeholdStatus: 'freehold',
    propertyTypes: ['apartment'],
    pricing: {
      pricePerSqft: {
        min: 550,
        max: 850
      },
      priceRangeAed: [200000, 700000],
      priceChangeYoY: {
        min: 10,
        max: 16
      },
      transactionVolume12m: '1000-1500',
      serviceChargePerSqft: {
        min: 7,
        max: 11
      }
    },
    investment: {
      rentalYieldPct: {
        min: 7.5,
        max: 10.0
      },
      demandLevel: 'medium',
      capitalAppreciation3y: {
        min: 18,
        max: 28
      }
    },
    connectivity: {
      nearestMetro: {
        name: 'Rashidiya',
        distanceKm: 10
      },
      upcomingMetro: {
        name: 'Academic City Metro',
        expectedYear: 2030
      },
      commuteMinutes: {
        difc: 30,
        businessBay: 28,
        marina: 38,
        airport: 18
      },
      walkabilityScore: 2
    },
    livability: {
      nearbyMalls: ['Silicon Central Mall', 'Dragon Mart'],
      nearbyHospitals: ['Fakeeh University Hospital'],
      nearbySupermarkets: ['Carrefour Market', 'Nesto'],
      nearbyParks: ['Academic City Park'],
      beachDistanceKm: 22,
      noiseLevel: 'low',
      petFriendly: false,
      communityFeel: 'student-academic'
    },
    familyFriendliness: {
      schools: [
        {
          name: 'Heriot-Watt University Dubai',
          rating: 'Very Good',
          curriculum: 'UK University',
          distanceKm: 1
        },
        {
          name: 'University of Birmingham Dubai',
          rating: 'Very Good',
          curriculum: 'UK University',
          distanceKm: 1
        }
      ],
      nearbyNurseries: 1,
      playAreas: 2,
      safetyPerception: 'medium'
    },
    futureGrowth: {
      dubai2040Impact: 'high',
      upcomingProjects: ['Academic City residential expansion', 'Student housing projects'],
      infrastructurePlanned: ['Metro Blue Line extension', 'Road improvements'],
      completionStatus: 0.5
    },
    tags: ['student', 'budget', 'academic', 'high-yield', 'emerging'],
    description: 'Dubai\'s university hub housing multiple international university campuses, offering very affordable apartments with strong rental demand from students and faculty.'
  }
];

export const DATA_UPDATED = "March 2026";
export const DATA_UPDATED_ISO = "2026-03-15";
