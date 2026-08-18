import { describe, it, expect } from "vitest";
import { extractJobPostings } from "./jsonld.js";

describe("extractJobPostings", () => {
  it("extracts a JobPosting from a single ld+json script block", () => {
    const html = `
      <html><body>
        <script type="application/ld+json">
          { "@context": "https://schema.org", "@type": "JobPosting", "title": "Alternant Data Analyst" }
        </script>
      </body></html>
    `;

    const jobPostings = extractJobPostings(html);
    expect(jobPostings).toHaveLength(1);
    expect(jobPostings[0]).toMatchObject({ title: "Alternant Data Analyst" });
  });

  it("ignores a block with invalid JSON without dropping the others", () => {
    const html = `
      <html><body>
        <script type="application/ld+json">{ not valid json </script>
        <script type="application/ld+json">
          { "@type": "JobPosting", "title": "Alternant Dev Web" }
        </script>
      </body></html>
    `;

    const jobPostings = extractJobPostings(html);
    expect(jobPostings).toHaveLength(1);
    expect(jobPostings[0]).toMatchObject({ title: "Alternant Dev Web" });
  });

  it("flattens an @graph array and keeps only JobPosting entries", () => {
    const html = `
      <html><body>
        <script type="application/ld+json">
          {
            "@context": "https://schema.org",
            "@graph": [
              { "@type": "Organization", "name": "ACME" },
              { "@type": "JobPosting", "title": "Alternant Développeur" }
            ]
          }
        </script>
      </body></html>
    `;

    const jobPostings = extractJobPostings(html);
    expect(jobPostings).toHaveLength(1);
    expect(jobPostings[0]).toMatchObject({ title: "Alternant Développeur" });
  });

  it("flattens a direct JSON array of entries", () => {
    const html = `
      <html><body>
        <script type="application/ld+json">
          [
            { "@type": "BreadcrumbList" },
            { "@type": "JobPosting", "title": "Alternant QA" }
          ]
        </script>
      </body></html>
    `;

    const jobPostings = extractJobPostings(html);
    expect(jobPostings).toHaveLength(1);
    expect(jobPostings[0]).toMatchObject({ title: "Alternant QA" });
  });

  it("matches an array @type that includes JobPosting", () => {
    const html = `
      <html><body>
        <script type="application/ld+json">
          { "@type": ["JobPosting", "Thing"], "title": "Alternant Support" }
        </script>
      </body></html>
    `;

    const jobPostings = extractJobPostings(html);
    expect(jobPostings).toHaveLength(1);
    expect(jobPostings[0]).toMatchObject({ title: "Alternant Support" });
  });

  it("returns an empty array when no JobPosting is present", () => {
    const html = `
      <html><body>
        <script type="application/ld+json">{ "@type": "Organization", "name": "ACME" }</script>
      </body></html>
    `;

    expect(extractJobPostings(html)).toEqual([]);
  });
});
