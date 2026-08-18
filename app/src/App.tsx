// App.tsx — root. Just renders <OctopusPet />. The 200x200 transparent window
// is the entire app — no chrome, no router, no menu.
import { OctopusPet } from "./components/OctopusPet";

export function App() {
  return <OctopusPet />;
}
