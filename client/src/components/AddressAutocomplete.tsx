import { useState, useRef, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { MapPin, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface AddressResult {
  display_name: string;
  address: {
    house_number?: string;
    road?: string;
    street?: string;
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    state?: string;
    country?: string;
    postcode?: string;
  };
  lat: string;
  lon: string;
}

interface ParsedAddress {
  streetAddress: string;
  city: string;
  state: string;
  zipCode: string;
}

interface AddressAutocompleteProps {
  id?: string;
  "aria-describedby"?: string;
  onAddressSelect: (address: ParsedAddress) => void;
  placeholder?: string;
  initialValue?: string;
  className?: string;
  "data-testid"?: string;
}

const STATE_ABBREVIATIONS: Record<string, string> = {
  "alabama": "AL",
  "alaska": "AK",
  "arizona": "AZ",
  "arkansas": "AR",
  "california": "CA",
  "colorado": "CO",
  "connecticut": "CT",
  "delaware": "DE",
  "florida": "FL",
  "georgia": "GA",
  "hawaii": "HI",
  "idaho": "ID",
  "illinois": "IL",
  "indiana": "IN",
  "iowa": "IA",
  "kansas": "KS",
  "kentucky": "KY",
  "louisiana": "LA",
  "maine": "ME",
  "maryland": "MD",
  "massachusetts": "MA",
  "michigan": "MI",
  "minnesota": "MN",
  "mississippi": "MS",
  "missouri": "MO",
  "montana": "MT",
  "nebraska": "NE",
  "nevada": "NV",
  "new hampshire": "NH",
  "new jersey": "NJ",
  "new mexico": "NM",
  "new york": "NY",
  "north carolina": "NC",
  "north dakota": "ND",
  "ohio": "OH",
  "oklahoma": "OK",
  "oregon": "OR",
  "pennsylvania": "PA",
  "rhode island": "RI",
  "south carolina": "SC",
  "south dakota": "SD",
  "tennessee": "TN",
  "texas": "TX",
  "utah": "UT",
  "vermont": "VT",
  "virginia": "VA",
  "washington": "WA",
  "west virginia": "WV",
  "wisconsin": "WI",
  "wyoming": "WY",
  "district of columbia": "DC",
};

function getStateAbbreviation(stateName: string): string {
  if (!stateName) return "";
  const normalized = stateName.toLowerCase().trim();
  if (STATE_ABBREVIATIONS[normalized]) {
    return STATE_ABBREVIATIONS[normalized];
  }
  if (stateName.length === 2 && Object.values(STATE_ABBREVIATIONS).includes(stateName.toUpperCase())) {
    return stateName.toUpperCase();
  }
  return stateName;
}

export function AddressAutocomplete({
  id,
  "aria-describedby": ariaDescribedBy,
  onAddressSelect,
  placeholder = "Start typing an address...",
  initialValue = "",
  className,
}: AddressAutocompleteProps) {
  const [query, setQuery] = useState(initialValue);
  const [results, setResults] = useState<AddressResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isSelectingRef = useRef(false);

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        if (!isSelectingRef.current) {
          setIsOpen(false);
        }
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  const searchAddresses = useCallback(async (searchQuery: string) => {
    if (searchQuery.length < 3) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setIsLoading(true);
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?` +
        `format=json&` +
        `addressdetails=1&` +
        `limit=5&` +
        `countrycodes=us&` +
        `q=${encodeURIComponent(searchQuery)}`,
        {
          headers: {
            "Accept-Language": "en-US,en",
          },
          signal: abortControllerRef.current.signal,
        }
      );

      if (response.ok) {
        const data: AddressResult[] = await response.json();
        setResults(data);
        setIsOpen(data.length > 0);
        setSelectedIndex(-1);
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return;
      }
      console.error("Address search error:", error);
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleInputChange = (value: string) => {
    setQuery(value);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      searchAddresses(value);
    }, 300);
  };

  const parseAddress = (result: AddressResult): ParsedAddress => {
    const addr = result.address;
    
    const houseNumber = addr.house_number || "";
    const street = addr.road || addr.street || "";
    const streetAddress = [houseNumber, street].filter(Boolean).join(" ").trim();

    const city = addr.city || addr.town || addr.village || addr.municipality || "";

    const stateAbbr = getStateAbbreviation(addr.state || "");
    
    const zipCode = addr.postcode || "";

    return { streetAddress, city, state: stateAbbr, zipCode };
  };

  const handleSelectAddress = (result: AddressResult) => {
    isSelectingRef.current = true;
    const parsed = parseAddress(result);
    setQuery(result.display_name);
    setIsOpen(false);
    setResults([]);
    onAddressSelect(parsed);
    setTimeout(() => {
      isSelectingRef.current = false;
    }, 100);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedIndex((prev) => 
          prev < results.length - 1 ? prev + 1 : prev
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : 0));
        break;
      case "Enter":
        e.preventDefault();
        if (selectedIndex >= 0 && results[selectedIndex]) {
          handleSelectAddress(results[selectedIndex]);
        }
        break;
      case "Escape":
        setIsOpen(false);
        break;
    }
  };

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <div className="relative">
        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          id={id}
          aria-describedby={ariaDescribedBy}
          type="text"
          value={query}
          onChange={(e) => handleInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => results.length > 0 && setIsOpen(true)}
          placeholder={placeholder}
          className="pl-10 pr-10 bg-white dark:bg-zinc-900 text-black dark:text-white"
          data-testid="input-address-autocomplete"
        />
        {isLoading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
        )}
      </div>

      {isOpen && results.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-white dark:bg-zinc-900 text-black dark:text-white shadow-lg">
          <ul className="max-h-60 overflow-auto py-1">
            {results.map((result, index) => (
              <li
                key={`${result.lat}-${result.lon}`}
                className={cn(
                  "flex items-start gap-2 px-3 py-2 cursor-pointer text-sm",
                  index === selectedIndex
                    ? "bg-accent text-accent-foreground"
                    : "hover:bg-accent/50"
                )}
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleSelectAddress(result);
                }}
                data-testid={`address-option-${index}`}
              >
                <MapPin className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
                <span className="line-clamp-2">{result.display_name}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
