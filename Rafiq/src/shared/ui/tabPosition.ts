import { makeMutable } from 'react-native-reanimated';

/**
 * Where the strip of tab pages stands: 0 shows the first tab, 1 the second,
 * anything between is mid-slide. It is one value read by every page, which is
 * the point: two pages each running their own animation can start a frame
 * apart, and the difference showed as a thin gap between them while they slid.
 */
export const tabPosition = makeMutable(0);
