export const site = {
  title: "A better standard for Leaving Cert maths.",
  // The essay page renders the supplied Markdown document.
  explainerUrl: "/explainer/",
};

export interface Signatory {
  id: string;
  name: string;
  description: string;
  priority: number;
  visible: boolean;
}

// DESIGN PLACEHOLDERS ONLY. These people have not signed or endorsed this letter.
// Lower priority numbers appear first. Set visible to false to remove a name.
export const signatories: Signatory[] = [
  {
    id: "example-1",
    name: "Micheál Martin",
    description: "Example signatory · not an endorsement",
    priority: 1,
    visible: true,
  },
  {
    id: "example-2",
    name: "Mary Lou McDonald",
    description: "Example signatory · not an endorsement",
    priority: 2,
    visible: true,
  },
  {
    id: "example-3",
    name: "Simon Harris",
    description: "Example signatory · not an endorsement",
    priority: 3,
    visible: true,
  },
  {
    id: "example-4",
    name: "Ivana Bacik",
    description: "Example signatory · not an endorsement",
    priority: 4,
    visible: true,
  },
  {
    id: "example-5",
    name: "Holly Cairns",
    description: "Example signatory · not an endorsement",
    priority: 5,
    visible: true,
  },
  {
    id: "example-6",
    name: "Roderic O’Gorman",
    description: "Example signatory · not an endorsement",
    priority: 6,
    visible: true,
  },
];
