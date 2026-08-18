// App.tsx — root. Just renders <OctopusPet />. The 192x192 transparent window
// is the entire app — no chrome, no router, no menu.
import { OctopusPet } from "./components/OctopusPet";

export function App() {
  return <OctopusPet />;
}
