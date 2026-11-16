/**
 * Items (RAPP-253) now live on the stock screen (RAPP-800): it lists every
 * item with its stock, adds one and opens each editor. The route stays so old
 * links still land there.
 */
import { Redirect } from 'expo-router';

export default function ItemsScreen() {
  return <Redirect href="/stock" />;
}
