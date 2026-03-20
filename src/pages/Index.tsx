import { useState, useCallback } from 'react';
import TopBar from '@/components/TopBar';
import CountryPanel from '@/components/CountryPanel';
import GlobeScene from '@/components/GlobeScene';
import { getCountryData, type CountryMusicData } from '@/data/countryData';

const GLOBE_BG = '#0a0a0f';

const Index = () => {
  const [selectedCountry, setSelectedCountry] = useState<CountryMusicData | null>(null);
  const [isClosing, setIsClosing] = useState(false);

  const handleCountryClick = useCallback((name: string) => {
    const data = getCountryData(name);
    setIsClosing(false);
    setSelectedCountry(data);
  }, []);

  const handleClose = useCallback(() => {
    setIsClosing(true);
    setTimeout(() => {
      setSelectedCountry(null);
      setIsClosing(false);
    }, 300);
  }, []);

  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: GLOBE_BG }}>
      <TopBar />
      <GlobeScene onCountryClick={handleCountryClick} isPanelOpen={!!selectedCountry} />
      {selectedCountry && (
        <CountryPanel data={selectedCountry} onClose={handleClose} isClosing={isClosing} />
      )}
    </div>
  );
};

export default Index;
