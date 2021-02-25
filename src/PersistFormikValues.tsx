import { FC, memo, useCallback, useEffect, useMemo } from 'react';

import { FormikValues, useFormikContext } from 'formik';
import useDebounce from 'react-use/lib/useDebounce';
import omit from 'lodash.omit';

const KEY_DELIMITER = '_';

export interface CustomStorage {
  setItem: (
    formId: string,
    formValues: Record<string, any> | string
  ) => Promise<any> | void;
  getItem: (key: string) => Promise<any> | void;
  removeItem: (key: string) => Promise<any> | void;
  clear: () => void;
}

export interface PersistFormikValuesProps {
  name: string;
  // Debounce in ms
  debounce?: number;
  // Possible provide own storage
  storage?: 'localStorage' | 'sessionStorage' | Storage | CustomStorage;
  // By default persisting only if form is valid
  persistInvalid?: boolean;
  // Hash form initial values for storage key generation
  hashInitials?: boolean;
  // Number of hash specificity must be increased if there is some problem with wrong cache hashes
  hashSpecificity?: number;
  // List of not persisted values
  ignoreValues?: string[];
  // Function to parse values before persist
  parseValues?: (values: Record<string, any>) => void;
}
/**
 * Hash function to do not persist different initial values
 * @param obj
 */
const getHash = (obj: any, specificity: number = 7) => {
  let hc = 0;
  try {
    const chars = JSON.stringify(obj).replace(/\{|\"|\}|\:|,/g, '');
    const len = chars.length;
    for (let i = 0; i < len; i++) {
      // Bump 7 to larger prime number to increase uniqueness
      hc += chars.charCodeAt(i) * specificity;
    }
  } catch (error) {
    hc = 0;
  }
  return hc;
};

// Controls is working in browser
const useBrowser = () => !!window;

const useStorage = (
  props: PersistFormikValuesProps
): Storage | CustomStorage | undefined => {
  const { storage = 'localStorage' } = props;
  const isBrowser = useBrowser();

  switch (storage) {
    case 'sessionStorage':
      return isBrowser ? window.sessionStorage : undefined;
    case 'localStorage':
      return isBrowser ? window.localStorage : undefined;
    default:
      return storage;
  }
};

const usePersistedString = (
  props: PersistFormikValuesProps
): [string | void | null, (values: FormikValues) => void] => {
  const { name: defaultName, hashInitials, hashSpecificity } = props;
  const { initialValues } = useFormikContext<any>();
  const keyName = `${defaultName}${KEY_DELIMITER}`;

  const name = useMemo(
    () =>
      hashInitials
        ? `${keyName}${getHash(initialValues, hashSpecificity)}`
        : defaultName,
    [defaultName, hashInitials, JSON.stringify(initialValues), hashSpecificity]
  );

  const storage = useStorage(props);

  const state = useMemo(() => {
    if (storage) {
      let item;
      Promise.resolve(storage.getItem(name))
        .then(value => {
          item = value;
        })
        .catch(error => console.error('ERROR GETTING ITEM ', error));
      return item;
    }
    return null;
  }, [name, storage]);

  const handlePersistValues = useCallback(
    (values: FormikValues) => {
      if (storage) {
        storage.setItem(name, JSON.stringify(values));
        // Remove all past cached values for this form
        Object.keys(storage).forEach(key => {
          if (key.indexOf(keyName) > -1 && key !== name) {
            storage.removeItem(key);
          }
        });
      }
    },
    [storage]
  );

  return [state, handlePersistValues];
};

const PersistFormikValuesMemo: FC<PersistFormikValuesProps> = props => {
  const { debounce = 300, persistInvalid, ignoreValues, parseValues } = props;
  const { values, setValues, isValid, initialValues } = useFormikContext<any>();
  const [persistedString, persistValues] = usePersistedString(props);
  const stringValues = JSON.stringify(values);

  const handlePersist = useCallback(() => {
    if (isValid || persistInvalid) {
      const valuesToPersist = ignoreValues
        ? omit(values, ignoreValues)
        : values;
      persistValues(
        parseValues ? parseValues(valuesToPersist) : valuesToPersist
      );
    }
  }, [stringValues, isValid, persistInvalid]);

  useEffect(() => {
    if (persistedString) {
      // Catches invalid json
      try {
        const persistedValues = JSON.parse(persistedString);
        const newValues = { ...initialValues, ...persistedValues };
        // Initial values should be merged with persisted
        if (stringValues !== JSON.stringify(newValues)) {
          setValues(newValues);
        }
      } catch (error) {
        console.error('Parse persisted values is not possible', error);
      }
    }
  }, [persistedString]);

  useDebounce(handlePersist, debounce, [stringValues, isValid, persistInvalid]);

  return null;
};

export const PersistFormikValues = memo(PersistFormikValuesMemo);
