// Blog article — /blog/california-pet-rent-and-esa-letters
// State pet-rent cluster. Content from statePetRentBlogs; chrome from
// StatePetRentBlog. SEO meta from CORE_PAGE_META via SEOManager + prerender.
import StatePetRentBlog from "../../components/feature/StatePetRentBlog";
import { statePetRentBlogs } from "../../data/statePetRentBlogs";

export default function BlogCaliforniaPetRentEsaLettersPage() {
  return <StatePetRentBlog cfg={statePetRentBlogs["california-pet-rent-and-esa-letters"]} />;
}
