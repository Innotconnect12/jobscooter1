const Tesseract = require('tesseract.js');
const sharp = require('sharp');
const Jimp = require('jimp');
const pdf = require('pdf-parse');
const crypto = require('crypto-js');
const moment = require('moment');
const fs = require('fs');
const path = require('path');

class AIService {
    constructor() {
        this.ocrWorker = null;
        this.initializeOCR();
        
        // Accredited institutions database (sample)
        this.accreditedInstitutions = [
            'University of Cape Town',
            'University of the Witwatersrand',
            'Stellenbosch University',
            'University of Pretoria',
            'Rhodes University',
            'Goethe Institute',
            'TestDaF Institute',
            'TELC',
            'Cambridge Assessment English',
            'British Council',
            // Add more accredited institutions
        ];
    }

    async initializeOCR() {
        try {
            console.log('Initializing OCR worker...');
            // OCR worker will be created on-demand to avoid startup delays
            console.log('✅ OCR service ready');
        } catch (error) {
            console.error('❌ OCR initialization failed:', error);
        }
    }

    async processIDDocument(imagePath) {
        try {
            console.log('Processing ID document:', imagePath);

        // Check if file is JPG as required
        const path = require('path');
        const fileExt = path.extname(imagePath).toLowerCase();
        if (fileExt !== '.jpg' && fileExt !== '.jpeg') {
            throw new Error('Only JPG files are supported for ID documents. Please upload a JPG image of your ID document.');
        }

            // Preprocess image for better OCR results
            const processedImagePath = await this.preprocessImage(imagePath);
            
            if (!processedImagePath) {
                throw new Error('Unsupported file format. Please upload a JPG or PNG image.');
            }
            
            // Extract text using OCR
            const extractedText = await this.extractTextFromImage(processedImagePath);
            
            // Parse extracted data
            const parsedData = this.parseIDData(extractedText);
            
            // Clean up processed image
            if (processedImagePath !== imagePath && fs.existsSync(processedImagePath)) {
                fs.unlinkSync(processedImagePath);
            }
            
            return {
                success: true,
                extractedData: parsedData,
                confidence: parsedData.confidence || 0.7
            };
        } catch (error) {
            console.error('ID processing failed:', error);
            return {
                success: false,
                error: error.message,
                requiresManualEntry: true
            };
        }
    }

    async preprocessImage(imagePath) {
        try {
            const path = require('path');
            const parsedPath = path.parse(imagePath);
            const outputPath = path.join(parsedPath.dir, parsedPath.name + '_processed.png');
            
            if (parsedPath.ext.toLowerCase() === '.pdf') {
                console.log('PDF detected - OCR cannot process PDF files directly');
                return null;
            }
            
            console.log('🔄 Advanced preprocessing for Namibian ID:', imagePath);
            
            // Advanced preprocessing specifically for ID documents
            await sharp(imagePath)
                .resize({ width: 1600, height: 1200, fit: 'inside' }) // Higher resolution
                .grayscale() // Convert to grayscale
                .normalize() // Normalize contrast
                .gamma(1.2) // Adjust gamma for better text visibility
                .sharpen({ sigma: 1.5 }) // More aggressive sharpening
                .threshold(128) // Binary threshold for cleaner text
                .median(3) // Noise reduction
                .png({ quality: 100, compressionLevel: 0 }) // High quality output
                .toFile(outputPath);
                
            console.log('✅ Image preprocessed successfully');
            return outputPath;
        } catch (error) {
            console.error('❌ Image preprocessing failed:', error);
            return imagePath;
        }
    }

    async extractTextFromImage(imagePath) {
        try {
            if (!this.ocrWorker) {
                console.log('🤖 Initializing OCR worker for Namibian ID processing...');
                this.ocrWorker = await Tesseract.createWorker('eng');
                
                // Optimized OCR parameters for ID documents
                await this.ocrWorker.setParameters({
                    // Character whitelist for Namibian IDs
                    tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 .()/',
                    // Page segmentation mode - assume uniform block of text
                    psm: '6',
                    // OCR Engine Mode - use LSTM engine
                    oem: '1',
                    // Preserve interword spaces
                    preserve_interword_spaces: '1',
                    // Language model weights
                    load_system_dawg: '0',
                    load_freq_dawg: '0',
                    load_unambig_dawg: '0',
                    load_punc_dawg: '0',
                    load_number_dawg: '1',
                    load_bigram_dawg: '0'
                });
                
                console.log('✅ OCR worker configured for ID documents');
            }

            console.log('🔍 Extracting text from processed image...');
            const { data: { text, confidence } } = await this.ocrWorker.recognize(imagePath);
            console.log('📊 OCR confidence:', Math.round(confidence), '%');
            
            return {
                text: text.trim(),
                confidence: confidence / 100
            };
        } catch (error) {
            console.error('❌ OCR extraction failed:', error);
            throw new Error('Failed to extract text from image');
        }
    }

    parseIDData(extractedData) {
        const text = extractedData.text || '';
        const confidence = extractedData.confidence || 0;
        
        console.log('🔍 Raw OCR Text for Namibian ID:');
        console.log('=' .repeat(60));
        console.log(text);
        console.log('=' .repeat(60));
        
        const result = {
            confidence: confidence,
            extractedFields: {}
        };

        // Clean and process the text for better parsing
        const cleanText = this.cleanExtractedText(text);
        console.log('🧹 Cleaned text:', cleanText);
        
        // Parse using multiple strategies
        const parseResults = this.parseNamibianID(cleanText);
        
        // Merge results with confidence scoring
        result.extractedFields = {
            ...parseResults,
            country: 'REPUBLIC OF NAMIBIA' // Default for Namibian IDs
        };
        
        console.log('📋 Final extracted fields:', result.extractedFields);
        
        return result;
    }
    
    cleanExtractedText(text) {
        // Clean up common OCR errors and normalize text
        return text
            .toUpperCase()
            .replace(/[|\\]/g, 'I') // Fix common I/l/| confusion
            .replace(/[0O]/g, 'O') // Normalize O/0
            .replace(/\s+/g, ' ') // Normalize whitespace
            .replace(/[^A-Z0-9\s\.\(\)\/\-]/g, ' ') // Remove special chars except basic punctuation
            .trim();
    }
    
    parseNamibianID(cleanText) {
        const extractedData = {};
        const lines = cleanText.split('\n').map(line => line.trim()).filter(line => line.length > 0);
        
        console.log('📝 Processing Namibian ID structure: ID Number -> Surname -> First Name');
        console.log('🔍 Full OCR text:', cleanText);
        
        // Parse following Namibian ID structure:
        // 1. ID Number (first, with "No." or similar)
        // 2. Surname (second)
        // 3. First Name (third)
        
        // STEP 1: Extract ID Number (comes first, pattern: "O21 1 15 OO3O 5")
        this.extractNamibianIDNumber(cleanText, extractedData);
        
        // STEP 2: Extract Surname ("MUDJANIMA")
        this.extractNamibianSurname(cleanText, extractedData);
        
        // STEP 3: Extract First Names ("ISMAEL")
        this.extractNamibianFirstNames(cleanText, extractedData);
        
        return extractedData;
    }
    
    extractNamibianIDNumber(cleanText, extractedData) {
        console.log('🎯 Step 1: Extracting Namibian ID Number (first field)...');
        
        // Enhanced patterns for Namibian ID numbers (format: YYMMDDXXXXC)
        // Looking for pattern like "O21 1 15 OO3O 5" which should be "02111500305"
        const namibianIDPatterns = [
            // Direct match for the exact OCR pattern we see: "O21 1 15 OO3O 5"
            /([O0])(\d{2})\s+(\d{1})\s+(\d{2})\s+([O0])(\d{3})([O0])\s+(\d{1})/i,
            // More flexible OCR error patterns
            /([O0]\d{2})\s+(\d{1})\s+(\d{2})\s+([O0]\d{3}[O0])\s+(\d{1})/i,
            /([O0]\d{2}\s*\d{1}\s*\d{2}\s*[O0]\d{3}[O0]\s*\d{1})/i,
            // Standard 11-digit patterns
            /NO\.?\s*(\d{2}\s*\d{4}\s*\d{4}\s*\d{1})/i,
            /(\d{2}\s*\d{4}\s*\d{4}\s*\d{1})/,
            /(\d{11})/
        ];
        
        for (const pattern of namibianIDPatterns) {
            const match = cleanText.match(pattern);
            if (match) {
                console.log('🔍 ID pattern match:', match);
                
                let idCandidate;
                if (match.length > 8) {
                    // Complex match with groups - reconstruct the ID: O21 1 15 OO3O 5
                    // Groups: [full, O, 21, 1, 15, O, 03, O, 5] -> 02111500305
                    idCandidate = `${match[1]}${match[2]}${match[3]}${match[4]}${match[5]}${match[6]}${match[7]}${match[8]}`;
                    console.log('🔍 Reconstructed from groups:', idCandidate);
                } else if (match.length > 1) {
                    idCandidate = match[1];
                } else {
                    idCandidate = match[0];
                }
                
                // Clean and normalize
                let idNum = idCandidate
                    .replace(/\s/g, '') // Remove spaces
                    .replace(/O/g, '0') // Fix OCR O/0 confusion
                    .replace(/[^0-9]/g, ''); // Remove non-digits
                
                console.log('🔍 Cleaned ID candidate:', idNum, 'Length:', idNum.length);
                
                if (idNum.length >= 11) {
                    // Take first 11 digits or try to find valid 11-digit sequence
                    const candidates = [];
                    if (idNum.length === 11) {
                        candidates.push(idNum);
                    } else {
                        // Extract all possible 11-digit sequences
                        for (let i = 0; i <= idNum.length - 11; i++) {
                            candidates.push(idNum.substr(i, 11));
                        }
                    }
                    
                    // Test each candidate for valid date
                    for (const candidate of candidates) {
                        const birthInfo = this.parseNamibianIDNumber(candidate);
                        if (birthInfo.isValid) {
                            extractedData.idNumber = `${candidate.substr(0,2)} ${candidate.substr(2,4)} ${candidate.substr(6,4)} ${candidate.substr(10,1)}`;
                            extractedData.dateOfBirth = birthInfo.dateOfBirth;
                            // Gender will be selected by user
                            extractedData.age = birthInfo.age;
                            console.log('✅ Valid Namibian ID extracted:', extractedData.idNumber);
                            console.log('📅 Birth Date:', birthInfo.dateOfBirth, '| 🎂 Age:', birthInfo.age);
                            return;
                        }
                    }
                }
            }
        }
        
        // SMART FALLBACK: Handle common OCR patterns with flexible pattern matching
        console.log('🧠 Smart OCR pattern recognition for common ID patterns...');
        
        // Look for common OCR error patterns (more generic approach)
        const smartPatterns = [
            // Match patterns like "O21 1 15 OO3O 5" but extract the actual digits
            /([O0])(\d{2})\s+(\d{1})\s+(\d{2})\s+([O0])([O0])(\d{1})([O0])\s+(\d{1})/i,
            // More flexible variations
            /([O0]\d{2})\s+(\d{1})\s+(\d{2})\s+([O0]{2}\d{1}[O0])\s+(\d{1})/i
        ];
        
        for (const smartPattern of smartPatterns) {
            const smartMatch = cleanText.match(smartPattern);
            if (smartMatch) {
                console.log('🎯 Found smart OCR pattern:', smartMatch[0]);
                
                // Extract digits from the pattern, converting O to 0
                let extractedDigits = '';
                for (let i = 1; i < smartMatch.length; i++) {
                    if (smartMatch[i]) {
                        extractedDigits += smartMatch[i].replace(/O/g, '0').replace(/[^0-9]/g, '');
                    }
                }
                
                console.log('🔄 Converted OCR pattern to:', extractedDigits);
                
                if (extractedDigits.length >= 11) {
                    const candidateId = extractedDigits.substr(0, 11);
                    const birthInfo = this.parseNamibianIDNumber(candidateId);
                    
                    if (birthInfo.isValid) {
                        extractedData.idNumber = `${candidateId.substr(0,2)} ${candidateId.substr(2,4)} ${candidateId.substr(6,4)} ${candidateId.substr(10,1)}`;
                        extractedData.dateOfBirth = birthInfo.dateOfBirth;
                        extractedData.age = birthInfo.age;
                        console.log('✅ Smart ID conversion successful:', extractedData.idNumber);
                        console.log('📅 Birth Date:', birthInfo.dateOfBirth, '| 🎂 Age:', birthInfo.age);
                        return;
                    }
                }
            }
        }
        
        console.log('⚠️ Could not extract valid ID number');
    }
    
    extractNamibianSurname(cleanText, extractedData) {
        console.log('🎯 Step 2: Extracting Namibian Surname (second field)...');
        
        const surnamePatterns = [
            // General surname patterns
            /SURNAME\s+([A-Z]+(?:\s+[A-Z]+)*)/i,
            /FAMILY NAME\s+([A-Z]+(?:\s+[A-Z]+)*)/i,
            // Look for capitalized words that could be surnames
            /\b([A-Z]{4,})\b/g // Words with 4+ capital letters
        ];
        
        // First try specific patterns
        for (const pattern of surnamePatterns.slice(0, 2)) {
            const match = cleanText.match(pattern);
            if (match && match[1] && match[1].length > 2) {
                extractedData.surname = match[1].trim();
                console.log('✅ Surname found (pattern):', extractedData.surname);
                return;
            }
        }
        
        // Try to find capitalized words (potential surnames)
        const capitalWords = [];
        let match;
        const capitalPattern = /\b([A-Z]{4,})\b/g;
        while ((match = capitalPattern.exec(cleanText)) !== null) {
            const word = match[1];
            // Skip common words that aren't surnames
            const skipWords = ['REPUBLIC', 'NAMIBIA', 'NATIONAL', 'IDENTITY', 'CARD', 'FIRST', 'NAME', 'NAMES'];
            if (!skipWords.includes(word) && word.length >= 4) {
                capitalWords.push(word);
            }
        }
        
        if (capitalWords.length > 0) {
            extractedData.surname = capitalWords[0]; // Take the first valid capitalized word
            console.log('✅ Surname found (capitalized word):', extractedData.surname);
            console.log('📝 Other capital words found:', capitalWords);
        } else {
            console.log('⚠️ Could not extract surname');
        }
    }
    
    extractNamibianFirstNames(cleanText, extractedData) {
        console.log('🎯 Step 3: Extracting Namibian First Names (third field)...');
        
        // Enhanced first names patterns
        const namePatterns = [
            /FIRST NAME\(?S?\)?\s+([A-Z\s]+?)(?=\n|[A-Z]{4,}|\)|$)/i,
            /GIVEN NAME\(?S?\)?\s+([A-Z\s]+?)(?=\n|[A-Z]{4,}|\)|$)/i,
            /NAME\(?S?\)?\s+([A-Z\s]+?)(?=\n|[A-Z]{4,}|\)|$)/i
        ];
        
        for (const pattern of namePatterns) {
            const match = cleanText.match(pattern);
            if (match && match[1].length > 2) {
                let namesStr = match[1].trim();
                // Clean up common OCR errors in names
                namesStr = namesStr.replace(/[^A-Z\s]/g, ' ').replace(/\s+/g, ' ').trim();
                
                if (namesStr.length > 2) {
                    extractedData.names = namesStr;
                    // Extract first name (first word that's not a title/prefix)
                    const nameParts = namesStr.split(' ').filter(part => part.length > 1);
                    if (nameParts.length > 0) {
                        // Skip common prefixes/titles
                        const skipPrefixes = ['MR', 'MS', 'MRS', 'DR', 'SR'];
                        const actualNames = nameParts.filter(name => !skipPrefixes.includes(name));
                        if (actualNames.length > 0) {
                            extractedData.firstName = actualNames[0];
                        } else {
                            extractedData.firstName = nameParts[0];
                        }
                    }
                    console.log('✅ Names found:', extractedData.names, '| First Name:', extractedData.firstName);
                    return;
                }
            }
        }
        
        // Generic fallback: Look for any capitalized words that might be first names
        if (!extractedData.firstName) {
            const capitalWords = [];
            let match;
            const capitalPattern = /\b([A-Z]{3,})\b/g;
            while ((match = capitalPattern.exec(cleanText)) !== null) {
                const word = match[1];
                // Skip common words that aren't names
                const skipWords = ['REPUBLIC', 'NAMIBIA', 'NATIONAL', 'IDENTITY', 'CARD', 'FIRST', 'NAME', 'NAMES', 'SURNAME', 'GIVEN'];
                if (!skipWords.includes(word) && word.length >= 3) {
                    capitalWords.push(word);
                }
            }
            
            // Take the second capitalized word (first is usually surname)
            if (capitalWords.length > 1) {
                extractedData.firstName = capitalWords[1];
                extractedData.names = capitalWords[1];
                console.log('✅ First name found (generic fallback):', extractedData.firstName);
            }
        }
        
        if (!extractedData.firstName) {
            console.log('⚠️ Could not extract first names with enhanced patterns');
        }
    }
    
    parseNamibianIDNumber(idNumber) {
        try {
            if (!/^\d{11}$/.test(idNumber)) {
                return { isValid: false };
            }
            
            // Extract date components (YYMMDD format)
            const year = parseInt(idNumber.substr(0, 2));
            const month = parseInt(idNumber.substr(2, 2));
            const day = parseInt(idNumber.substr(4, 2));
            
            // Determine century (Namibian IDs: assume 20xx for years 00-21, 19xx for 22-99)
            const fullYear = year <= 21 ? 2000 + year : 1900 + year;
            
            // Validate date
            if (month < 1 || month > 12 || day < 1 || day > 31) {
                return { isValid: false };
            }
            
            // Gender determination will be handled by user selection
            // const genderDigits = parseInt(idNumber.substr(6, 4));
            // const gender = genderDigits < 5000 ? 'Female' : 'Male';
            
            const dateOfBirth = `${fullYear}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
            const age = new Date().getFullYear() - fullYear;
            
            return {
                isValid: true,
                dateOfBirth,
                // gender will be selected by user
                age,
                fullYear,
                month,
                day
            };
        } catch (error) {
            console.error('Error parsing Namibian ID number:', error);
            return { isValid: false };
        }
    }

    async processCertificate(filePath) {
        try {
            console.log('Processing certificate:', filePath);
            
            let extractedText;
            const fileExtension = path.extname(filePath).toLowerCase();
            
            if (fileExtension === '.pdf') {
                extractedText = await this.extractTextFromPDF(filePath);
            } else {
                extractedText = await this.extractTextFromImage(filePath);
            }
            
            const certificateData = this.parseCertificateData(extractedText.text || extractedText);
            
            return {
                success: true,
                certificateData: certificateData,
                confidence: extractedText.confidence || 0.8
            };
        } catch (error) {
            console.error('Certificate processing failed:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async extractTextFromPDF(pdfPath) {
        try {
            const dataBuffer = fs.readFileSync(pdfPath);
            const data = await pdf(dataBuffer);
            return {
                text: data.text,
                confidence: 0.95 // PDFs generally have high text extraction confidence
            };
        } catch (error) {
            console.error('PDF text extraction failed:', error);
            throw new Error('Failed to extract text from PDF');
        }
    }

    parseCertificateData(text) {
        const result = {
            type: 'unknown',
            subject: '',
            institution: '',
            dateIssued: '',
            grade: '',
            holderName: '',
            isAccredited: false,
            classification: '',
            authenticityScore: 0,
            verificationDetails: {
                institutionFound: false,
                dateFormatValid: false,
                nameConsistent: false,
                gradePresent: false,
                certificateStructureValid: false
            }
        };

        // Detect certificate type
        if (this.containsAny(text.toLowerCase(), ['certificate', 'diploma', 'degree'])) {
            if (this.containsAny(text.toLowerCase(), ['bachelor', 'bsc', 'ba', 'bcom'])) {
                result.type = 'Bachelor\'s Degree';
                result.classification = 'academic';
            } else if (this.containsAny(text.toLowerCase(), ['master', 'msc', 'ma', 'mcom', 'mba'])) {
                result.type = 'Master\'s Degree';
                result.classification = 'academic';
            } else if (this.containsAny(text.toLowerCase(), ['phd', 'doctorate', 'doctoral'])) {
                result.type = 'Doctorate';
                result.classification = 'academic';
            } else if (this.containsAny(text.toLowerCase(), ['diploma'])) {
                result.type = 'Diploma';
                result.classification = 'professional';
            } else {
                result.type = 'Certificate';
                result.classification = 'professional';
            }
        } else if (this.containsAny(text.toLowerCase(), ['reference', 'recommendation', 'letter'])) {
            result.type = 'Reference Letter';
            result.classification = 'reference';
        }

        // Extract institution with enhanced matching
        const institutionPatterns = [
            /(?:university of|institute|college|school|academy)\s+([a-z\s&]+)/gi,
            /([a-z\s&]+)\s+(?:university|institute|college)/gi,
            /(goethe[\s-]?institut|testdaf|telc|cambridge|british council)/gi
        ];
        
        let foundInstitution = '';
        for (const pattern of institutionPatterns) {
            const matches = text.match(pattern);
            if (matches) {
                foundInstitution = matches[0].trim();
                break;
            }
        }
        
        // Check against accredited institutions list
        for (const institution of this.accreditedInstitutions) {
            if (text.toLowerCase().includes(institution.toLowerCase()) || 
                foundInstitution.toLowerCase().includes(institution.toLowerCase())) {
                result.institution = institution;
                result.isAccredited = true;
                result.verificationDetails.institutionFound = true;
                break;
            }
        }
        
        // If no exact match, use the found institution
        if (!result.institution && foundInstitution) {
            result.institution = foundInstitution;
        }

        // Extract dates
        const datePatterns = [
            /(\d{1,2}[-/]\d{1,2}[-/]\d{4})/g,
            /(\d{4}[-/]\d{1,2}[-/]\d{1,2})/g,
            /(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}/gi
        ];

        for (const pattern of datePatterns) {
            const matches = text.match(pattern);
            if (matches && matches.length > 0) {
                result.dateIssued = matches[matches.length - 1]; // Usually the last date is the issue date
                break;
            }
        }

        // Extract subject/field of study
        const subjectPatterns = [
            /(?:in|of)\s+([A-Za-z\s]+)(?:\s+has|successfully)/i,
            /qualification in\s+([A-Za-z\s]+)/i,
            /(?:bachelor|master|diploma)(?:'s)?\s+(?:of|in)\s+([A-Za-z\s]+)/i
        ];

        for (const pattern of subjectPatterns) {
            const match = text.match(pattern);
            if (match) {
                result.subject = match[1].trim();
                break;
            }
        }

        // Extract holder name with enhanced patterns
        const namePatterns = [
            /(?:this is to certify that|certifies that|awarded to)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/i,
            /(?:Mr\.?|Mrs\.?|Ms\.?|Miss)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/i,
            /(?:name|student|candidate):\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/i,
            /([A-Z][A-Z\s]{3,})\s+(?:has|successfully|is|hereby)/i,
            /presented to\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/i
        ];

        for (const pattern of namePatterns) {
            const match = text.match(pattern);
            if (match) {
                result.holderName = match[1].trim();
                break;
            }
        }

        // Extract grade/classification
        const gradePatterns = [
            /(?:with|grade|class)\s+([A-Za-z\s]+)(?:\s+class|\s+distinction)/i,
            /(?:first class|second class|third class|distinction|pass)/gi
        ];

        for (const pattern of gradePatterns) {
            const match = text.match(pattern);
            if (match) {
                result.grade = match[0].trim();
                break;
            }
        }

        // Calculate authenticity score
        result.authenticityScore = this.calculateAuthenticityScore(result, text);
        
        return result;
    }
    
    calculateAuthenticityScore(certificateData, rawText) {
        let score = 0;
        const details = certificateData.verificationDetails;
        
        // Institution verification (30 points)
        if (details.institutionFound && certificateData.isAccredited) {
            score += 30;
        } else if (certificateData.institution) {
            score += 15;
        }
        
        // Date format validation (20 points)
        if (certificateData.dateIssued) {
            const dateRegex = /\d{1,2}[-/]\d{1,2}[-/]\d{4}|\d{4}[-/]\d{1,2}[-/]\d{1,2}|[A-Za-z]+\s+\d{1,2},?\s+\d{4}/;
            if (dateRegex.test(certificateData.dateIssued)) {
                score += 20;
                details.dateFormatValid = true;
            }
        }
        
        // Name presence (15 points)
        if (certificateData.holderName && certificateData.holderName.length > 3) {
            score += 15;
        }
        
        // Grade/classification presence (10 points)
        if (certificateData.grade) {
            score += 10;
            details.gradePresent = true;
        }
        
        // Subject/field presence (10 points)
        if (certificateData.subject) {
            score += 10;
        }
        
        // Certificate structure validation (15 points)
        const structuralElements = [
            /(?:certificate|diploma|degree)/i,
            /(?:university|institute|college)/i,
            /(?:awarded|presented|conferred)/i,
            /\d{4}/ // Year
        ];
        
        const structureScore = structuralElements.reduce((acc, pattern) => {
            return acc + (pattern.test(rawText) ? 1 : 0);
        }, 0);
        
        if (structureScore >= 3) {
            score += 15;
            details.certificateStructureValid = true;
        } else if (structureScore >= 2) {
            score += 8;
        }
        
        return Math.min(score, 100);
    }
    
    // Method to verify certificate holder name against applicant name
    verifyNameMatch(certificateName, applicantFirstName, applicantSurname) {
        if (!certificateName || !applicantFirstName || !applicantSurname) {
            return { matches: false, confidence: 0 };
        }
        
        const certNameLower = certificateName.toLowerCase();
        const firstNameLower = applicantFirstName.toLowerCase();
        const surnameNameLower = applicantSurname.toLowerCase();
        
        // Direct matches
        const firstNameMatch = certNameLower.includes(firstNameLower);
        const surnameMatch = certNameLower.includes(surnameNameLower);
        
        if (firstNameMatch && surnameMatch) {
            return { matches: true, confidence: 0.95 };
        } else if (firstNameMatch || surnameMatch) {
            return { matches: true, confidence: 0.7 };
        }
        
        // Check for initials or partial matches
        const firstInitial = firstNameLower.charAt(0);
        const hasFirstInitial = certNameLower.includes(firstInitial + '.');
        
        if (hasFirstInitial && surnameMatch) {
            return { matches: true, confidence: 0.8 };
        }
        
        return { matches: false, confidence: 0 };
    }

    containsAny(text, keywords) {
        return keywords.some(keyword => text.includes(keyword));
    }

    async verifyGermanLanguageCertificate(certificateData) {
        // German language certificate verification
        const germanInstitutions = [
            'Goethe Institut',
            'TestDaF Institute',
            'TELC',
            'ÖSD',
            'Deutsche Sprachprüfung',
            'Zertifikat Deutsch'
        ];

        const isGermanCert = germanInstitutions.some(inst => 
            certificateData.institution?.toLowerCase().includes(inst.toLowerCase()) ||
            certificateData.subject?.toLowerCase().includes('german') ||
            certificateData.subject?.toLowerCase().includes('deutsch')
        );

        if (!isGermanCert) {
            return {
                isValid: false,
                reason: 'Certificate is not from a recognized German language institution'
            };
        }

        // Check for common German proficiency levels
        const germanLevels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'DSH', 'TestDaF'];
        const hasLevel = germanLevels.some(level => 
            certificateData.subject?.includes(level) ||
            certificateData.grade?.includes(level)
        );

        return {
            isValid: isGermanCert && certificateData.isAccredited,
            level: hasLevel ? 'Verified German Proficiency' : 'Basic German',
            institution: certificateData.institution
        };
    }

    generateTrafficLightScore(profileData) {
        let score = 0;
        const factors = {
            idVerified: profileData.idVerified ? 20 : 0,
            certificatesCount: Math.min(profileData.certificates?.length || 0, 5) * 10,
            accreditedCertificates: (profileData.accreditedCertificatesCount || 0) * 15,
            languageVerified: profileData.languagesVerified ? 15 : 0,
            hasProfilePicture: profileData.profilePicture ? 10 : 0,
            hasVideoIntro: profileData.videoIntroduction ? 10 : 0,
            profileCompletion: (profileData.completionPercentage || 0) * 0.2
        };

        score = Object.values(factors).reduce((sum, value) => sum + value, 0);

        // Determine traffic light status
        if (score >= 80) {
            return {
                status: 'green',
                score: score,
                message: 'Profile is complete and ready for employers',
                recommendations: []
            };
        } else if (score >= 60) {
            return {
                status: 'yellow',
                score: score,
                message: 'Profile needs minor improvements',
                recommendations: this.generateRecommendations(profileData)
            };
        } else {
            return {
                status: 'red',
                score: score,
                message: 'Profile requires significant attention',
                recommendations: this.generateRecommendations(profileData)
            };
        }
    }

    generateRecommendations(profileData) {
        const recommendations = [];

        if (!profileData.idVerified) {
            recommendations.push('Complete ID verification');
        }
        if (!profileData.certificates || profileData.certificates.length === 0) {
            recommendations.push('Upload your certificates and qualifications');
        }
        if (!profileData.languagesVerified) {
            recommendations.push('Verify your language skills');
        }
        if (!profileData.profilePicture) {
            recommendations.push('Add a professional profile picture');
        }
        if (!profileData.videoIntroduction) {
            recommendations.push('Record a video introduction');
        }
        if (profileData.accreditedCertificatesCount === 0) {
            recommendations.push('Ensure certificates are from accredited institutions');
        }

        return recommendations;
    }

    async cleanup() {
        try {
            if (this.ocrWorker) {
                await this.ocrWorker.terminate();
                this.ocrWorker = null;
            }
        } catch (error) {
            console.error('Cleanup failed:', error);
        }
    }
}

module.exports = AIService;