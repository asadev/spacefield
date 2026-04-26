"use client";

interface Developer {
  name: string;
  file: string;
}

const developers: Developer[] = [
  { name: "Emaar", file: "emaar.svg" },
  { name: "Nakheel", file: "nakheel.svg" },
  { name: "DAMAC", file: "damac.svg" },
  { name: "Meraas", file: "meraas.svg" },
  { name: "Sobha", file: "sobha.svg" },
  { name: "Omniyat", file: "omniyat.svg" },
  { name: "Danube", file: "danube.png" },
  { name: "Binghatti", file: "binghatti.svg" },
  { name: "Ellington", file: "ellington.png" },
  { name: "Select Group", file: "selectgroup.svg" },
  { name: "Aldar", file: "aldar.png" },
  { name: "Majid Al Futtaim", file: "maf.svg" },
  { name: "Nshama", file: "nshama.svg" },
  { name: "Reportage", file: "reportage.svg" },
  { name: "Samana", file: "samana.png" },
  { name: "Kleindienst", file: "kleindienst.png" },
  { name: "Tiger", file: "tiger.webp" },
  { name: "Deyaar", file: "deyaar.svg" },
  { name: "Dubai Holding", file: "dubaiholding.svg" },
  { name: "Arada", file: "arada.svg" },
  { name: "Wasl", file: "wasl.png" },
  { name: "Eagle Hills", file: "eaglehills.webp" },
  { name: "Seven Tides", file: "seventides.png" },
  { name: "RAK Properties", file: "rakproperties.svg" },
  { name: "Imtiaz", file: "imtiaz.svg" },
  { name: "Iman", file: "iman.svg" },
  { name: "Al Barari", file: "albarari.png" },
  { name: "ORO24", file: "oro24.png" },
  { name: "Prescott", file: "prescott.svg" },
];

function LogoItem({ dev }: { dev: Developer }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/logos/${dev.file}`}
      alt={dev.name}
      className="h-10 w-auto max-w-[160px] object-contain"
      style={{
        filter: "brightness(0) invert(1)",
        opacity: 0.4,
      }}
    />
  );
}

export default function DeveloperMarquee() {
  return (
    <section className="relative py-14 overflow-hidden">
      <div className="mx-auto max-w-[1200px] px-6 lg:px-10 mb-8">
        <p className="text-[0.65rem] font-medium uppercase tracking-[0.25em] text-gray-500 text-center">
          Worked on projects of
        </p>
      </div>

      <div className="relative overflow-hidden mx-auto w-full lg:w-[80%]">
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-24 bg-gradient-to-r from-black to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-24 bg-gradient-to-l from-black to-transparent" />

        <div className="flex animate-marquee">
          <div className="flex items-center gap-12 shrink-0 pr-12">
            {developers.map((dev) => (
              <div key={dev.name} className="flex-shrink-0" title={dev.name}>
                <LogoItem dev={dev} />
              </div>
            ))}
          </div>
          <div className="flex items-center gap-12 shrink-0 pr-12" aria-hidden>
            {developers.map((dev) => (
              <div key={dev.name} className="flex-shrink-0" title={dev.name}>
                <LogoItem dev={dev} />
              </div>
            ))}
          </div>
        </div>
      </div>

      <style jsx global>{`
        @keyframes marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .animate-marquee {
          animation: marquee 200s linear infinite;
          width: max-content;
        }
      `}</style>
    </section>
  );
}
