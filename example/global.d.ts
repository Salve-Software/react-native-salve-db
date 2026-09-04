// Module augmentation required by phosphor-react-native's TypeScript setup —
// see the "Typescript support" section of its README. Declares only the
// extra `className` member each interface is missing; merges into the
// existing declaration rather than re-declaring it (an `extends` here would
// make the interface reference itself).
import 'react-native-svg';
import 'phosphor-react-native';

declare module 'react-native-svg' {
  interface SvgProps {
    className?: string;
  }
}

declare module 'phosphor-react-native' {
  interface IconProps {
    className?: string;
  }
}
