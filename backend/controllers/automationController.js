const supabase = require('../config/supabase');

exports.createAutomation = async (req, res) => {
    const { name, curl } = req.body;
    const userId = req.user.id;

    if (!name || name.trim() === '') {
        return res.status(400).json({ success: false, message: 'Automation name is required' });
    }

    if (!curl || curl.trim() === '') {
        return res.status(400).json({ success: false, message: 'cURL content is required' });
    }

    try {
        // Normalize token in cURL to prevent exposing real tokens in UI/Database
        // Replaces ?token=SOMETHING or &token=SOMETHING with token={{ASKEVA_TOKEN}}
        const sanitizedCurl = curl.replace(/([?&]token=)[^&'"\s\\]+/g, '$1{{ASKEVA_TOKEN}}');

        const { data, error } = await supabase
            .from('automations')
            .insert([
                {
                    user_id: userId,
                    automation_name: name.trim(),
                    curl_content: sanitizedCurl
                }
            ])
            .select();

        if (error) {
            console.error('Supabase insert error:', error.message);
            return res.status(500).json({ success: false, message: 'Unable to save automation' });
        }

        res.status(201).json({
            success: true,
            message: 'Automation saved successfully',
            automation: data[0]
        });
    } catch (err) {
        console.error('Server error saving automation:', err.message);
        res.status(500).json({ success: false, message: 'Unable to save automation. Please try again.' });
    }
};

exports.getAutomations = async (req, res) => {
    const userId = req.user.id;

    try {
        const { data, error } = await supabase
            .from('automations')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Supabase fetch error:', error.message);
            return res.status(500).json({ success: false, message: 'Unable to load automations' });
        }

        res.json({
            success: true,
            automations: data
        });
    } catch (err) {
        console.error('Server error fetching automations:', err.message);
        res.status(500).json({ success: false, message: 'Unable to load automations. Please try again.' });
    }
};

exports.deleteAutomation = async (req, res) => {
    const { id } = req.params;
    const userId = req.user.id;

    try {
        const { data, error } = await supabase
            .from('automations')
            .delete()
            .eq('id', id)
            .eq('user_id', userId) // Ensure ownership
            .select();

        if (error) {
            console.error('Supabase delete error:', error.message);
            return res.status(500).json({ success: false, message: 'Unable to delete automation' });
        }

        if (data.length === 0) {
            return res.status(404).json({ success: false, message: 'Automation not found or not authorized' });
        }

        res.json({
            success: true,
            message: 'Automation deleted successfully'
        });
    } catch (err) {
        console.error('Server error deleting automation:', err.message);
        res.status(500).json({ success: false, message: 'Unable to delete automation. Please try again.' });
    }
};
