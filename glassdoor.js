const axios = require('axios');
const cheerio = require('cheerio');
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config()


const app = express();
const PORT = process.env.GLASSDOORPORT

// Middleware
const corsOptions = {
    origin: ["https://jobscanner-pb9s.onrender.com"], // Replace with your frontend URL
    methods: ["GET", "POST"],
    credentials: true
};

app.use(cors(corsOptions));
app.use(express.json());

// MongoDB connection
mongoose.connect(process.env.MONGO_URL_SCRAPING, { useNewUrlParser: true, useUnifiedTopology: true })


const jobSchema = new mongoose.Schema({
    role: String,
    company: String,
    location: String,
    description: String,
    link: String,
    jobPosted: String,
    jobTitle: String,
    searchLocation: String,
    status: String,
    salary: String,
    logo: String

}, { collection: 'glassdoorjobs' });
const Job = mongoose.models.GlassdoorJob || mongoose.model('GlassdoorJob', jobSchema);

// API key and base Glassdoor URL
const apiKey = '20e627e4cb8068c6ec82d73c9f6c469f';
const glassdoorUrl = 'https://www.glassdoor.de/Job/frankfurt-am-main-deutschland-software-engineer-jobs-SRCH_IL.0,29_IC2632180_KO30,47.htm';

// Function to scrape a single page with user-specified job title and location
async function scrapePage(pageNumber, jobTitle, location) {
    const pageUrl = `${glassdoorUrl}&p=${pageNumber}&keyword=${encodeURIComponent(jobTitle)}&location=${encodeURIComponent(location)}`;
    const scraperApiUrl = `http://api.scraperapi.com/?api_key=${apiKey}&url=${pageUrl}&premium=true`;

    try {
        const response = await axios.get(scraperApiUrl);
        if (response.status === 200) {
            const $ = cheerio.load(response.data);

            const locations = [];
            const companies = [];
            const roles = [];
            const descriptions = [];
            const jobPosted = [];
            const jobLinks = [];
            const salaries = [];
            const statuss = [];
            const companyLogos = [];


            $('div.JobCard_location__Ds1fM').each((_, element) => {
                locations.push($(element).text().trim());
            });

            $('span.EmployerProfile_compactEmployerName__9MGcV').each((_, element) => {
                companies.push($(element).text().trim());
            });

            $('a.JobCard_jobTitle__GLyJ1').each((_, element) => {
                roles.push($(element).text().trim());
                jobLinks.push($(element).attr('href'));
            });

            $('div.JobDetails_jobDescription__uW_fK.JobDetails_blurDescription__vN7nh').each((_, element) => {
                descriptions.push($(element).text().trim());
            });

            $('div.JobCard_listingAge__jJsuc').each((_, element) => {
                jobPosted.push($(element).text().trim().replace('T', 'days'));
            });
            $('.JobCard_easyApplyTag__5vlo5').each((_, elem) => {
                statuss.push($(elem).text().trim().replace('Schnell bewerben', 'Easy Apply'));
            });
    
            $('.JobCard_salaryEstimate__QpbTW').each((_, elem) => {
                const rawSalary = $(elem).text().trim();
                salaries.push(rawSalary.replace(/\xa0/g, ' ')); // Replace non-breaking spaces with regular spaces
            });
            $('img.avatar-base_Image__2RcF9').each((_, elem) => {
                const logoSrc = $(elem).attr('src');
                companyLogos.push(logoSrc || null); // Add null if src is not found
            });

            // Create job objects with jobTitle and location
            const jobs = [];
            for (let i = 0; i < roles.length; i++) {
                jobs.push({
                    role: roles[i] || null,
                    company: companies[i] || null,
                    location: locations[i] || null,
                    description: descriptions[i] || null,
                    link: jobLinks[i] || null,
                    jobPosted: jobPosted[i] || null,
                    jobTitle: jobTitle || null,
                    searchLocation: location || null,
                    status: statuss[i] || null,
                    salary: salaries[i] || null,
                    logo: companyLogos[i] || null
                });
            }
            return jobs;
        } else {
            console.log(`Failed to retrieve page ${pageNumber}. Status code: ${response.status}`);
            return [];
        }
    } catch (error) {
        console.error(`An error occurred while scraping page ${pageNumber}:`, error);
        return [];
    }
}

const scrapeGlassdoorPagesConcurrently = async (jobTitle, location, startPage, endPage, maxWorkers = 5) => {
    const pageNumbers = Array.from({ length: endPage - startPage + 1 }, (_, i) => startPage + i);
  
    const workerTasks = pageNumbers.map((page) => scrapePage(jobTitle, location, page));
    const results = await Promise.all(workerTasks);
  
    // Flatten the results
    return results.flat();
  };

// Endpoint to fetch and store Glassdoor jobs with search parameters
app.post('/fetch-jobs', async (req, res) => {
    const { job_title, location } = req.body;

    if (!job_title || !location) {
        return res.status(400).json({ error: 'Job title and location are required.' });
    }

    const startPage = 1;
    const endPage = 3;

    try {
        const jobs = await scrapeGlassdoorPagesConcurrently(job_title, location, startPage, endPage);

        // Clear previous jobs and save new ones
        await Job.deleteMany({});
        await Job.insertMany(jobs);

        res.json({ message: 'Job fetching completed', jobCount: jobs.length });
    } catch (error) {
        console.error('Error fetching jobs:', error);
        res.status(500).json({ error: 'Failed to fetch jobs. Please try again.' });
    }
});

// Endpoint to get jobs with search parameters
app.get('/glassdoor-get-jobs', async (req, res) => {
    try {
        const jobs = await Job.find({}, { _id: 0 });
        res.json(jobs);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error fetching job listings. Please try again.' });
    }
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
