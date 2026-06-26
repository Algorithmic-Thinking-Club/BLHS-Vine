[out:json][timeout:120];
(
  way["building"](47.1555,-122.1745,47.1620,-122.1635);
  relation["building"](47.1555,-122.1745,47.1620,-122.1635);
  way["amenity"="parking"](47.1555,-122.1745,47.1620,-122.1635);
  way["highway"~"footway|path|service|pedestrian|cycleway"](47.1555,-122.1745,47.1620,-122.1635);
  way["leisure"~"pitch|track|sports_centre|stadium|playground"](47.1555,-122.1745,47.1620,-122.1635);
  way["sport"](47.1555,-122.1745,47.1620,-122.1635);
  way["barrier"](47.1555,-122.1745,47.1620,-122.1635);
  way["amenity"="school"](47.1555,-122.1745,47.1620,-122.1635);
  way["natural"](47.1555,-122.1745,47.1620,-122.1635);
);
out body geom;
