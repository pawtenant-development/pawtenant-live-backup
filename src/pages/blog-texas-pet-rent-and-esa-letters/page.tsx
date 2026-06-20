// Blog article — /blog/texas-pet-rent-and-esa-letters
// State pet-rent cluster. Content from statePetRentBlogs; chrome from
// StatePetRentBlog. SEO meta from CORE_PAGE_META via SEOManager + prerender.
import StatePetRentBlog from "../../components/feature/StatePetRentBlog";
import { statePetRentBlogs } from "../../data/statePetRentBlogs";

export default function BlogTexasPetRentEsaLettersPage() {
  return <StatePetRentBlog cfg={statePetRentBlogs["texas-pet-rent-and-esa-letters"]} />;
}
