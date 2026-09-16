import { Route, Routes } from "react-router";
import { FundPage } from "./routes/fund";
import { Home } from "./routes/home";
import { Layout } from "./routes/layout";

/** Routes only. The router itself differs between the browser and the prerender. */
export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/f/:code" element={<FundPage />} />
        <Route path="*" element={<FundPage />} />
      </Route>
    </Routes>
  );
}
