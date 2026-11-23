// What you learn when you click something in our Solar System.
// Numbers: NASA NSSDC Planetary Fact Sheet (updated 13 Nov 2026), NSSDC Moon and Sun fact sheets.
// Spacecraft: NASA mission pages. Facts are short, checked, and phrased so they stay true.
export const INFO = {
  'The Sun': {
    kind: 'Our star · a yellow dwarf',
    stats: [['Diameter', '1,391,400 km'], ['Mass', '333,000 Earths'], ['Surface', '5,500 °C'], ['Core', '15 million °C'], ['Spin', '25 days (mid-latitudes)'], ['Gravity', '28× Earth']],
    facts: ['Holds 99.8% of all the mass in the Solar System.', 'About 4.6 billion years old, roughly halfway through its life.', 'Its light reaches Earth in about 8 minutes 20 seconds.'],
  },
  Mercury: {
    kind: 'Planet · 1st from the Sun',
    stats: [['Diameter', '4,879 km'], ['Day (sunrise to sunrise)', '176 Earth days'], ['Year', '88 days'], ['Temperature', '167 °C average'], ['Gravity', '0.38× Earth'], ['Moons', '0']],
    facts: ['The smallest planet, only a little bigger than our Moon.', 'Days reach 430 °C and nights fall to −180 °C: there is no air to hold the heat.', 'Its deep polar craters hold water ice that never sees sunlight.'],
  },
  Venus: {
    kind: 'Planet · 2nd from the Sun',
    stats: [['Diameter', '12,104 km'], ['Spin', '243 Earth days, backwards'], ['Year', '225 days'], ['Temperature', '464 °C'], ['Gravity', '0.91× Earth'], ['Moons', '0']],
    facts: ['The hottest planet, hotter than Mercury, because its thick carbon-dioxide air traps heat.', 'It spins the opposite way to most planets, so the Sun rises in the west.', 'The air pressure at the surface is about 90 times Earth’s.'],
  },
  Earth: {
    kind: 'Planet · 3rd from the Sun · home',
    stats: [['Diameter', '12,756 km'], ['Day', '24 hours'], ['Year', '365.25 days'], ['Temperature', '15 °C average'], ['Gravity', '9.8 m/s²'], ['Moons', '1']],
    facts: ['The only world we know of with life and liquid water on its surface.', 'About 71% of the surface is covered by water.', 'Set the clock to Live and the day and night on this globe match the real Earth at this moment.'],
  },
  Moon: {
    kind: 'Earth’s only natural satellite',
    stats: [['Diameter', '3,475 km'], ['Orbit', '27.3 days'], ['Gravity', '0.17× Earth'], ['Temperature', '−20 °C average'], ['Day', '29.5 Earth days'], ['Escape speed', '2.4 km/s']],
    facts: ['It always shows Earth the same face; it spins once for every trip around us.', 'It drifts about 3.8 cm farther from Earth every year.', 'Twelve people walked on it between 1969 and 1972.'],
  },
  Mars: {
    kind: 'Planet · 4th from the Sun',
    stats: [['Diameter', '6,792 km'], ['Day', '24 h 40 min'], ['Year', '687 days'], ['Temperature', '−65 °C average'], ['Gravity', '0.38× Earth'], ['Moons', '2']],
    facts: ['Red because its dust is rich in iron oxide: rust.', 'Olympus Mons is about two and a half times taller than Mount Everest.', 'Its two small moons are called Phobos and Deimos.'],
  },
  Jupiter: {
    kind: 'Gas giant · 5th from the Sun',
    stats: [['Diameter', '142,984 km'], ['Day', '9 h 56 min'], ['Year', '11.9 years'], ['Temperature', '−110 °C'], ['Gravity', '2.4× Earth'], ['Moons', '95']],
    facts: ['More than twice as massive as all the other planets put together.', 'The Great Red Spot is a storm wider than Earth.', 'The shortest day of any planet: under 10 hours.'],
  },
  Saturn: {
    kind: 'Gas giant · 6th from the Sun',
    stats: [['Diameter', '120,536 km'], ['Day', '10 h 39 min'], ['Year', '29.4 years'], ['Temperature', '−140 °C'], ['Gravity', '0.92× Earth'], ['Moons', '274']],
    facts: ['Less dense than water: in a big enough ocean, it would float.', 'Its rings are mostly chunks of water ice, very wide but only about 10 metres thick in most places.', 'It has more known moons than any other planet.'],
  },
  Uranus: {
    kind: 'Ice giant · 7th from the Sun',
    stats: [['Diameter', '51,118 km'], ['Day', '17 h 14 min, backwards'], ['Year', '84 years'], ['Temperature', '−195 °C'], ['Gravity', '0.89× Earth'], ['Moons', '28']],
    facts: ['It is tipped on its side (98°), so it rolls around the Sun.', 'Each pole gets about 42 years of sunlight, then 42 years of darkness.', 'Only one spacecraft has visited: Voyager 2, in 1986.'],
  },
  Neptune: {
    kind: 'Ice giant · 8th from the Sun',
    stats: [['Diameter', '49,528 km'], ['Day', '16 h 6 min'], ['Year', '164 years'], ['Temperature', '−200 °C'], ['Gravity', '1.1× Earth'], ['Moons', '16']],
    facts: ['Found in 1846 by mathematics before anyone saw it through a telescope.', 'It has the fastest winds in the Solar System, about 2,000 km/h.', 'Voyager 2 is the only spacecraft to have visited, in 1989.'],
  },
  ISS: {
    kind: 'Space station · crewed since 2000',
    stats: [['Length', '109 m'], ['Mass', 'about 420 tonnes'], ['Height', 'about 400 km'], ['One orbit', 'about 90 minutes'], ['Speed', '28,000 km/h'], ['First part', '1998']],
    facts: ['People have lived on board without a break since November 2000.', 'The crew sees about 16 sunrises and 16 sunsets every day.', 'Shown hugely enlarged here; at true size it would be invisible.'],
  },
  Hubble: {
    kind: 'Space telescope · since 1990',
    stats: [['Launched', 'April 1990'], ['Mirror', '2.4 m'], ['Length', '13.2 m'], ['Height', 'about 530 km'], ['One orbit', 'about 95 minutes'], ['Sees', 'visible and ultraviolet light']],
    facts: ['Astronauts visited it five times to repair and upgrade it.', 'Its observations helped show that the universe’s expansion is speeding up.', 'Shown enlarged here.'],
  },
  'James Webb': {
    kind: 'Space telescope · launched 2021',
    stats: [['Launched', '25 Dec 2021'], ['Mirror', '6.5 m, 18 gold hexagons'], ['Sunshield', 'tennis-court size'], ['Where', 'L2, 1.5 million km away'], ['Runs at', 'below −223 °C'], ['Sees', 'infrared light']],
    facts: ['It looks in infrared, which lets it see some of the first galaxies.', 'It sits beyond Earth, on the side away from the Sun, keeping pace with us.', 'Shown enlarged here.'],
  },
  Juno: {
    kind: 'Jupiter orbiter · arrived 2016',
    stats: [['Launched', 'August 2011'], ['Arrived', 'July 2016'], ['Power', 'three solar wings'], ['Orbit', 'over the poles'], ['Wingspan', 'about 20 m'], ['Agency', 'NASA']],
    facts: ['The first solar-powered spacecraft to work at Jupiter.', 'It swoops over Jupiter’s poles, close above the cloud tops.', 'Shown enlarged here.'],
  },
  Cassini: {
    kind: 'Saturn orbiter · 2004–2017',
    stats: [['Launched', 'October 1997'], ['At Saturn', '2004 to 2017'], ['Probe', 'Huygens, landed on Titan'], ['Orbits', '294 of Saturn'], ['Ended', '15 Sep 2017'], ['Agencies', 'NASA, ESA, ASI']],
    facts: ['Its Huygens probe made the first landing in the outer Solar System, on Titan, in 2005.', 'It found water geysers on the moon Enceladus.', 'It ended its mission by diving into Saturn. Shown here as a tribute, enlarged.'],
  },
  'Voyager 1': {
    kind: 'Interstellar probe · launched 1977',
    stats: [['Launched', '5 Sep 1977'], ['Left the Sun’s bubble', 'August 2012'], ['Distance', 'over 24 billion km'], ['Speed', 'about 61,000 km/h'], ['Carries', 'the Golden Record'], ['Power', 'nuclear (RTG)']],
    facts: ['The farthest human-made object.', 'Its radio signals take nearly a day to reach Earth.', 'It carries a golden record of sounds and images from Earth. Shown enlarged here.'],
  },
};

/** "8 min 19 s" for a distance in astronomical units */
export function lightTime(au) {
  const s = au * 499.005; if (s < 60) return `${s.toFixed(1)} s`;
  const m = Math.floor(s / 60), r = Math.round(s % 60); if (m < 60) return `${m} min ${r} s`;
  return `${Math.floor(m / 60)} h ${m % 60} min`;
}

// ---------- info for everything else: imagined worlds in other star systems, and things you made
const CLASS_COLOUR = { O: 'blue', B: 'blue-white', A: 'white', F: 'yellow-white', G: 'yellow', K: 'orange', M: 'red' };
const CLASS_NOTE = {
  O: 'The rarest and hottest kind of star. It burns out in a few million years.',
  B: 'A hot, bright young star, thousands of times more luminous than the Sun.',
  A: 'A white star like Sirius, the brightest star in our night sky.',
  F: 'A little hotter and bigger than the Sun.',
  G: 'The same kind of star as our Sun.',
  K: 'An orange star, cooler than the Sun and long-lived: a good host for life.',
  M: 'A red dwarf, the most common kind of star in the galaxy. It can shine for hundreds of billions of years, far longer than the universe has existed so far.',
};
const WORLD_NOTE = {
  'Ocean world': 'A world covered by water, under a thick, bright sky.', 'Desert world': 'Dry and dusty, with sand seas and canyons.',
  'Cloud world': 'Its surface is hidden under deep, hot clouds.', 'Rocky world': 'Bare rock, scarred by ancient impacts.',
  'Cratered world': 'Old and airless: craters on top of craters.', 'Gas giant': 'A ball of hydrogen and helium with no solid surface.',
  'Ringed giant': 'A gas giant with wide rings of ice and dust.', 'Ice giant': 'Water, ammonia and methane ices under a blue haze.',
  'Lava world': 'So close to its star that its surface stays molten.',
};
const KIND_NAME = { terran: 'Ocean world', desert: 'Desert world', ice: 'Ice world', lava: 'Lava world', gas: 'Gas giant' };
const ordinal = (n) => n + (['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th');
const lifeGyr = (m) => 10 * Math.pow(m, -2.5);   // main-sequence lifetime, billions of years (mass in suns)
const fmtLife = (g) => g >= 1000 ? `${Math.round(g / 1000)} trillion years` : g >= 1 ? `${g.toFixed(g < 10 ? 1 : 0)} billion years` : `${Math.round(g * 1000)} million years`;

export function starInfo(temp, cls, _simMass, made) {
  const mass = Math.pow(temp / 5778, 1.98);   // main-sequence mass from temperature (T ∝ M^0.505), so the numbers agree
  return {
    kind: `${CLASS_COLOUR[cls]} star · class ${cls}${made ? ' · you made this' : ' · imagined'}`,
    stats: [['Temperature', `${Math.round(temp).toLocaleString()} K`], ['Class', cls], ['Mass', `${mass < 10 ? mass.toFixed(mass < 1 ? 2 : 1) : Math.round(mass)} Suns`], ['Lifetime', fmtLife(lifeGyr(mass))]],
    facts: [CLASS_NOTE[cls], made ? 'Heavier stars are hotter and bluer, and burn out much faster.' : 'Every star system in this universe is generated: no one has ever seen this one.'],
  };
}
export function worldInfo({ kind, made, index, system, orbitAU, earthRadii, massEarths, starTemp }) {
  const name = made ? KIND_NAME[kind] || 'World' : kind;
  const stats = [['Type', name], ['Size', `${earthRadii.toFixed(1)} × Earth`]];
  if (massEarths) stats.push(['Mass', `${massEarths < 10 ? massEarths.toFixed(1) : Math.round(massEarths)} × Earth`]);
  if (orbitAU) { stats.push(['Distance from its star', `${orbitAU.toFixed(2)} AU`]); stats.push(['Year', `${Math.round(365.25 * Math.pow(orbitAU, 1.5)).toLocaleString()} days`]); }
  if (starTemp) stats.push(['Its star', `${Math.round(starTemp).toLocaleString()} K`]);
  return {
    kind: made ? `${name} · you made this` : `${name} · ${ordinal(index + 1)} planet of ${system} · imagined`,
    stats, facts: [WORLD_NOTE[name] || WORLD_NOTE[KIND_NAME[kind]] || 'A world of its own.', made ? 'Throw it near a star and it will settle into an orbit.' : 'Generated from this system’s seed, so it is the same every time you visit.'],
  };
}
export function holeInfo(mass) {
  const suns = mass * 10, km = 2 * 2.95 * suns;
  return {
    kind: 'Black hole · you made this',
    stats: [['Mass', `${Math.round(suns)} Suns`], ['Event horizon', `${Math.round(km)} km across`], ['Escape speed at the edge', 'the speed of light'], ['Light that escapes', 'none']],
    facts: ['Nothing that crosses the event horizon comes back, not even light.', 'The glowing ring is matter heating up as it spirals in.', 'Things that pass too close are stretched into streams before they fall.'],
  };
}
